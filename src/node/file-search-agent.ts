import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { IndexedItem, IndexedVocabulary } from '../vocabulary/indexed.js';

export type FileSearchKind = 'file' | 'directory';
export type FileSearchPointStage = 'root' | 'page' | 'entry' | 'action';

export interface FileSearchMatch {
  path: string;
  kind: FileSearchKind;
  modifiedAt: string;
  sizeBytes: number | null;
  immediateChildren: number | null;
  sizeLabel: string;
}

export type FileSearchEvent =
  | { type: 'inspect'; path: string; depth: number; entries: number }
  | { type: 'point'; stage: FileSearchPointStage; number: number; label: string; probability: number }
  | { type: 'enter'; path: string; depth: number }
  | { type: 'collect'; match: FileSearchMatch; count: number }
  | { type: 'skip'; path: string }
  | { type: 'backtrack'; from: string; to: string | null }
  | { type: 'warning'; path: string; message: string }
  | { type: 'finish'; reason: FileSearchReason; matches: number };

export type FileSearchReason = 'verified_results' | 'search_exhausted' | 'max_points' | 'aborted';

export interface FileSearchOptions {
  roots?: string[];
  maxResults?: number;
  maxDepth?: number;
  maxPoints?: number;
  includeHidden?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: FileSearchEvent) => void | Promise<void>;
}

export interface FileSearchRun {
  done: boolean;
  reason: FileSearchReason;
  goal: string;
  roots: string[];
  matches: FileSearchMatch[];
  visitedDirectories: number;
  points: number;
}

interface SearchEntry extends FileSearchMatch {
  name: string;
}

interface DirectoryFrame {
  path: string;
  root: string;
  depth: number;
  loaded: boolean;
  remaining: SearchEntry[];
}

interface Selectable<T> extends IndexedItem<T> {
  summary: string;
}

interface SearchAction {
  type: 'enter' | 'collect' | 'skip';
}

interface BackSelection {
  __fileSearchBack: true;
}

const BACK: BackSelection = { __fileSearchBack: true };
const isBack = (value: unknown): value is BackSelection => typeof value === 'object' && value !== null && '__fileSearchBack' in value;

const windowsDriveRoots = (): string[] => Array.from({ length: 26 }, (_item, index) => `${String.fromCharCode(65 + index)}:\\`);
const sortByName = <T extends { name: string }>(items: T[]): T[] => items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
const within = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
const modified = async (target: string): Promise<string> => (await stat(target)).mtime.toISOString();
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index]!;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
};

/** Discover readable filesystem roots without invoking a shell command. */
export async function discoverFilesystemRoots(): Promise<string[]> {
  const candidates = process.platform === 'win32' ? windowsDriveRoots() : ['/'];
  const roots = await Promise.all(candidates.map(async candidate => {
    try {
      const info = await stat(candidate);
      return info.isDirectory() ? await realpath(candidate) : null;
    } catch {
      return null;
    }
  }));
  return [...new Set(roots.filter((root): root is string => root !== null))];
}

/**
 * A read-only, Jev-directed filesystem search loop.
 * Jev selects numbered boards; this class owns pagination, backtracking,
 * confinement, budgets, and result verification.
 */
export class JevFileSearchAgent {
  readonly #numbers: IndexedVocabulary;

  constructor(numbers: IndexedVocabulary) {
    this.#numbers = numbers;
  }

  async search(goal: string, options: FileSearchOptions = {}): Promise<FileSearchRun> {
    if (!goal.trim()) throw new Error('File search requires a nonempty goal.');
    const maxResults = options.maxResults ?? 1;
    const maxDepth = options.maxDepth ?? 32;
    const maxPoints = options.maxPoints ?? 120;
    const includeHidden = options.includeHidden ?? true;
    if (!Number.isInteger(maxResults) || maxResults < 1) throw new Error('maxResults must be a positive integer.');
    if (!Number.isInteger(maxDepth) || maxDepth < 0) throw new Error('maxDepth must be a nonnegative integer.');
    if (!Number.isInteger(maxPoints) || maxPoints < 1) throw new Error('maxPoints must be a positive integer.');

    const emit = async (event: FileSearchEvent): Promise<void> => { await options.onEvent?.(structuredClone(event)); };
    const requestedRoots = options.roots?.length ? options.roots : await discoverFilesystemRoots();
    const roots: string[] = [];
    for (const requested of requestedRoots) {
      try {
        const resolved = await realpath(path.resolve(requested));
        if (!(await stat(resolved)).isDirectory()) throw new Error('Path is not a directory.');
        if (!roots.includes(resolved)) roots.push(resolved);
      } catch (error) {
        await emit({ type: 'warning', path: requested, message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (!roots.length) throw new Error('No readable filesystem roots are available.');

    const matches: FileSearchMatch[] = [];
    const frames: DirectoryFrame[] = [];
    const rootsRemaining = [...roots];
    const visited = new Set<string>();
    const searchStartedAt = new Date().toISOString();
    let points = 0;

    const context = (): string => [
      `Search request: ${goal.trim()}`,
      `Current date and search start time (UTC): ${searchStartedAt}.`,
      `Need up to ${maxResults} verified result${maxResults === 1 ? '' : 's'}.`,
      `Collected: ${matches.length ? matches.map(match => `${match.kind} ${match.path}`).join(' | ') : 'none yet'}.`,
      `Current route: ${frames.length ? frames.map(frame => frame.path).join(' -> ') : 'filesystem roots'}.`,
      'Choose from the real entries shown. A directory may be the answer itself or a route toward it.',
    ].join('\n');

    const point = async <T>(items: Selectable<T>[], question: string, stage: FileSearchPointStage): Promise<T> => {
      if (!items.length) throw new Error('Cannot point into an empty board.');
      if (items.length === 1) return items[0]!.value;
      if (points >= maxPoints) throw new Error('FILE_SEARCH_MAX_POINTS');
      const answer = await this.#numbers.choose({
        goal: goal.trim(), context: context(), question, items, module: `file-search.${stage}`,
      });
      points += 1;
      await emit({ type: 'point', stage, number: answer.number, label: answer.item.label, probability: answer.decision.probability });
      return answer.item.value;
    };

    const choosePaged = async <T>(items: Selectable<T>[], question: string, finalStage: FileSearchPointStage): Promise<T> => {
      if (items.length <= 25) return point(items, question, finalStage);
      const pages: Selectable<Selectable<T>[]>[] = [];
      for (let offset = 0; offset < items.length; offset += 25) {
        const pageItems = items.slice(offset, offset + 25);
        const first = offset + 1;
        const last = offset + pageItems.length;
        const names = pageItems.map(item => item.summary).join('; ');
        pages.push({
          label: `Items ${first}-${last}`,
          description: names.length > 1400 ? `${names.slice(0, 1397)}...` : names,
          summary: `${first}-${last}: ${names.length > 500 ? `${names.slice(0, 497)}...` : names}`,
          value: pageItems,
        });
      }
      const selectedPage = await choosePaged(pages, `Which page is most likely to contain an entry that advances this search? ${question}`, 'page');
      return choosePaged(selectedPage, question, finalStage);
    };

    const choosePagedWithBack = async <T>(items: Selectable<T>[], question: string, finalStage: FileSearchPointStage, allowBack: boolean): Promise<T | BackSelection> => {
      const back: Selectable<BackSelection> = {
        label: 'GO BACK',
        description: 'Leave this directory and continue from its parent. Choose only when the route already provides evidence that this branch is wrong—not merely because the target is not visible at this level.',
        summary: 'Go back to the parent directory',
        value: BACK,
      };
      const boardCapacity = allowBack ? 24 : 25;
      if (items.length <= boardCapacity) return point<T | BackSelection>(allowBack ? [...items, back] : items, question, finalStage);
      const pages: Selectable<Selectable<T>[]>[] = [];
      for (let offset = 0; offset < items.length; offset += boardCapacity) {
        const pageItems = items.slice(offset, offset + boardCapacity);
        const first = offset + 1;
        const last = offset + pageItems.length;
        const names = pageItems.map(item => item.summary).join('; ');
        pages.push({
          label: `Items ${first}-${last}`,
          description: names.length > 1400 ? `${names.slice(0, 1397)}...` : names,
          summary: `${first}-${last}: ${names.length > 500 ? `${names.slice(0, 497)}...` : names}`,
          value: pageItems,
        });
      }
      const selectedPage = await choosePagedWithBack(pages, allowBack ? `Choose the most promising page. GO BACK only if prior route evidence shows this entire directory is wrong. ${question}` : `Choose the most promising page and continue searching this root. ${question}`, 'page', allowBack);
      if (isBack(selectedPage)) return selectedPage;
      return choosePagedWithBack(selectedPage, question, finalStage, allowBack);
    };

    const finish = async (reason: FileSearchReason): Promise<FileSearchRun> => {
      await emit({ type: 'finish', reason, matches: matches.length });
      return { done: reason === 'verified_results', reason, goal: goal.trim(), roots, matches, visitedDirectories: visited.size, points };
    };

    try {
      while (true) {
        if (options.signal?.aborted) return finish('aborted');
        if (matches.length >= maxResults) return finish('verified_results');
        if (points >= maxPoints) return finish('max_points');

        if (!frames.length) {
          if (!rootsRemaining.length) return finish('search_exhausted');
          const rootItems: Selectable<string>[] = await Promise.all(rootsRemaining.map(async root => {
            const modifiedAt = await modified(root).catch(() => 'unknown');
            const immediateChildren = await readdir(root).then(entries => entries.length).catch(() => null);
            const size = immediateChildren === null ? 'folder size unavailable' : `${immediateChildren} immediate items`;
            return {
              label: root,
              description: `Readable filesystem root. Size: ${size}. Last modified: ${modifiedAt}.`,
              summary: `${root} (${size}; modified ${modifiedAt})`,
              value: root,
            };
          }));
          const selectedRoot = await choosePaged(rootItems, 'Which filesystem root should be searched next?', 'root');
          rootsRemaining.splice(rootsRemaining.indexOf(selectedRoot), 1);
          frames.push({ path: selectedRoot, root: selectedRoot, depth: 0, loaded: false, remaining: [] });
          await emit({ type: 'enter', path: selectedRoot, depth: 0 });
          continue;
        }

        const frame = frames.at(-1)!;
        if (!frame.loaded) {
          let entries;
          try {
            const current = await realpath(frame.path);
            if (!within(frame.root, current)) throw new Error('Resolved path escapes the selected root.');
            entries = await readdir(current, { withFileTypes: true });
          } catch (error) {
            await emit({ type: 'warning', path: frame.path, message: error instanceof Error ? error.message : String(error) });
            const from = frames.pop()!.path;
            await emit({ type: 'backtrack', from, to: frames.at(-1)?.path ?? null });
            continue;
          }
          const visible = entries.filter(entry => {
            if ((!includeHidden && entry.name.startsWith('.')) || entry.isSymbolicLink()) return false;
            return entry.isDirectory() || entry.isFile();
          });
          const enriched: SearchEntry[] = [];
          // Bound metadata reads so very large directories do not create an
          // unbounded number of simultaneous filesystem operations.
          for (let offset = 0; offset < visible.length; offset += 32) {
            const batch = await Promise.all(visible.slice(offset, offset + 32).map(async entry => {
              const candidate = path.join(frame.path, entry.name);
              try {
                const info = await stat(candidate);
                const immediateChildren = entry.isDirectory() ? await readdir(candidate).then(children => children.length).catch(() => null) : null;
                const sizeBytes = entry.isFile() ? info.size : null;
                const sizeLabel = entry.isFile()
                  ? `${formatBytes(info.size)} (${info.size} bytes)`
                  : immediateChildren === null ? 'folder size unavailable' : `${immediateChildren} immediate items`;
                return {
                  name: entry.name,
                  path: candidate,
                  kind: entry.isDirectory() ? 'directory' as const : 'file' as const,
                  modifiedAt: info.mtime.toISOString(),
                  sizeBytes,
                  immediateChildren,
                  sizeLabel,
                };
              } catch (error) {
                await emit({ type: 'warning', path: candidate, message: `Could not read last-modified metadata: ${error instanceof Error ? error.message : String(error)}` });
                return null;
              }
            }));
            enriched.push(...batch.filter((entry): entry is SearchEntry => entry !== null));
          }
          frame.remaining = sortByName(enriched);
          frame.loaded = true;
          visited.add(frame.path);
          await emit({ type: 'inspect', path: frame.path, depth: frame.depth, entries: frame.remaining.length });
        }

        if (!frame.remaining.length) {
          const from = frames.pop()!.path;
          await emit({ type: 'backtrack', from, to: frames.at(-1)?.path ?? null });
          continue;
        }

        const candidateItems: Selectable<SearchEntry>[] = frame.remaining.map(entry => ({
          label: `${entry.name}${entry.kind === 'directory' ? '/' : ''}`,
          description: `${entry.kind} at ${entry.path}. Size: ${entry.sizeLabel}. Last modified: ${entry.modifiedAt}.`,
          summary: `${entry.name}${entry.kind === 'directory' ? '/' : ''} (${entry.kind}; ${entry.sizeLabel}; modified ${entry.modifiedAt})`,
          value: entry,
        }));
        const allowBack = frames.length > 1 || rootsRemaining.length > 0;
        const candidate = await choosePagedWithBack(candidateItems, allowBack
          ? 'Which remaining entry is the best match or the most promising route toward the requested result? Choose GO BACK only when route evidence shows this directory is wrong.'
          : 'Which remaining entry is the best match or the most promising route toward the requested result? This is the only search root, so continue through one of its pages or entries.', 'entry', allowBack);
        if (isBack(candidate)) {
          const from = frames.pop()!.path;
          await emit({ type: 'backtrack', from, to: frames.at(-1)?.path ?? null });
          continue;
        }
        frame.remaining.splice(frame.remaining.findIndex(entry => entry.path === candidate.path), 1);

        const actions: Selectable<SearchAction>[] = [];
        if (candidate.kind === 'directory' && frame.depth < maxDepth) actions.push({
          label: 'ENTER', description: `Open ${candidate.path} and inspect its children. Choose this when the folder is a promising route, not yet the requested result.`, summary: `Enter ${candidate.name}`, value: { type: 'enter' },
        });
        actions.push({
          label: 'COLLECT', description: `Accept ${candidate.path} itself as a result because it satisfies the search request.`, summary: `Collect ${candidate.name}`, value: { type: 'collect' },
        });
        actions.push({
          label: 'SKIP', description: 'This entry is neither a result nor a useful route. Continue with unexplored entries.', summary: `Skip ${candidate.name}`, value: { type: 'skip' },
        });
        const action = await point(actions, `What should happen with this ${candidate.kind}: ${candidate.path}?`, 'action');

        if (action.type === 'skip') {
          await emit({ type: 'skip', path: candidate.path });
          continue;
        }
        if (action.type === 'enter') {
          try {
            const resolved = await realpath(candidate.path);
            if (!within(frame.root, resolved)) throw new Error('Resolved directory escapes the selected root.');
            if (!(await stat(resolved)).isDirectory()) throw new Error('Selected entry is no longer a directory.');
            if (visited.has(resolved)) {
              await emit({ type: 'skip', path: resolved });
              continue;
            }
            frames.push({ path: resolved, root: frame.root, depth: frame.depth + 1, loaded: false, remaining: [] });
            await emit({ type: 'enter', path: resolved, depth: frame.depth + 1 });
          } catch (error) {
            await emit({ type: 'warning', path: candidate.path, message: error instanceof Error ? error.message : String(error) });
          }
          continue;
        }

        try {
          const resolved = await realpath(candidate.path);
          if (!within(frame.root, resolved)) throw new Error('Resolved result escapes the selected root.');
          const info = await stat(resolved);
          const kind: FileSearchKind = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : candidate.kind;
          if (!matches.some(match => match.path === resolved)) {
            const immediateChildren = kind === 'directory' ? await readdir(resolved).then(children => children.length).catch(() => null) : null;
            const sizeBytes = kind === 'file' ? info.size : null;
            const sizeLabel = kind === 'file'
              ? `${formatBytes(info.size)} (${info.size} bytes)`
              : immediateChildren === null ? 'folder size unavailable' : `${immediateChildren} immediate items`;
            const match = { path: resolved, kind, modifiedAt: info.mtime.toISOString(), sizeBytes, immediateChildren, sizeLabel };
            matches.push(match);
            await emit({ type: 'collect', match, count: matches.length });
          }
        } catch (error) {
          await emit({ type: 'warning', path: candidate.path, message: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'FILE_SEARCH_MAX_POINTS') return finish('max_points');
      throw error;
    }
  }
}
