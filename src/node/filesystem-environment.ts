import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { NavigationEnvironment, NavigationObservation } from '../modules/navigator.js';
import type { PointChoice } from '../types.js';

export interface FilesystemState {
  current: string;
  depth: number;
  done?: boolean;
  target?: FilesystemTarget;
}

export interface FilesystemTarget {
  path: string;
  kind: 'directory' | 'file';
}

export type FilesystemTransition =
  | { type: 'enter'; path: string }
  | { type: 'select'; path: string; kind: 'directory' | 'file' }
  | { type: 'back'; path: string }
  | { type: 'select-current'; path: string }
  | { type: 'stop' };

export interface ReadonlyFilesystemOptions {
  root: string;
  maxDepth?: number;
  includeHidden?: boolean;
}

export class ReadonlyFilesystemEnvironment implements NavigationEnvironment<FilesystemState, FilesystemTransition, FilesystemTarget> {
  readonly id = 'filesystem.readonly';
  readonly root: string;
  readonly maxDepth: number;
  readonly includeHidden: boolean;
  readonly #rootReal: string;

  private constructor(root: string, rootReal: string, maxDepth: number, includeHidden: boolean) {
    this.root = root;
    this.#rootReal = rootReal;
    this.maxDepth = Math.min(maxDepth, 4);
    this.includeHidden = includeHidden;
  }

  static async create(options: ReadonlyFilesystemOptions): Promise<ReadonlyFilesystemEnvironment> {
    const root = path.resolve(options.root);
    const rootReal = await realpath(root);
    return new ReadonlyFilesystemEnvironment(root, rootReal, options.maxDepth ?? 4, options.includeHidden ?? true);
  }

  initialState(): FilesystemState {
    return { current: this.root, depth: 0 };
  }

  #assertInside(target: string): void {
    const relative = path.relative(this.#rootReal, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Filesystem transition escapes root: ${target}`);
  }

  async observe(state: FilesystemState): Promise<NavigationObservation<FilesystemState, FilesystemTransition, FilesystemTarget>> {
    this.#assertInside(await realpath(state.current));
    if (state.done) return { state, summary:`Navigation finished at ${state.target?.path ?? state.current}`, choices:[], done:true, ...(state.target ? {target:state.target} : {}), depth:state.depth };
    const dirents = await readdir(state.current, { withFileTypes:true });
    const choices: PointChoice<FilesystemTransition>[] = [];
    let index = 0;
    for (const entry of dirents.sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}))) {
      if ((!this.includeHidden && entry.name.startsWith('.')) || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
      const candidate = path.resolve(state.current, entry.name);
      const resolved = await realpath(candidate).catch(()=>null);
      if (!resolved) continue;
      try { this.#assertInside(resolved); } catch { continue; }
      const kind: 'directory' | 'file' = entry.isDirectory() ? 'directory' : 'file';
      const canEnter = kind === 'directory' && state.depth < this.maxDepth;
      choices.push({
        id:`entry_${index++}`,
        label:`${entry.name}${kind === 'directory' ? '/' : ''}`,
        description:`Real ${kind} at ${candidate}.${canEnter ? ' Selecting enters it.' : ' Selecting makes it the final target.'}`,
        kind:'transition' as const,
        value:canEnter ? {type:'enter' as const,path:candidate} : {type:'select' as const,path:candidate,kind},
      });
    }
    choices.push({id:'select_current',label:'[select current location]',description:'Treat the current directory as the final target.',kind:'control',value:{type:'select-current' as const,path:state.current}});
    if (state.current !== this.root) choices.push({id:'go_back',label:'../',description:'Return to the parent directory.',kind:'control',value:{type:'back' as const,path:path.dirname(state.current)}});
    choices.push({id:'stop',label:'[stop: target not found]',description:'Stop without selecting a target.',kind:'control',value:{type:'stop' as const}});
    return {state,summary:`Real location ${state.current}; ${choices.length - (state.current === this.root ? 2 : 3)} visible entries.`,choices,depth:state.depth};
  }

  async transition(state: FilesystemState, transition: FilesystemTransition): Promise<FilesystemState> {
    if (transition.type === 'stop') return {...state,done:true};
    const resolved = await realpath(transition.path);
    this.#assertInside(resolved);
    if (transition.type === 'enter') {
      if (state.depth >= this.maxDepth) throw new Error(`Maximum filesystem depth ${this.maxDepth} reached.`);
      return {current:resolved,depth:state.depth + 1};
    }
    if (transition.type === 'back') return {current:resolved,depth:Math.max(0,state.depth - 1)};
    if (transition.type === 'select-current') return {...state,done:true,target:{path:resolved,kind:'directory'}};
    return {...state,done:true,target:{path:resolved,kind:transition.kind}};
  }
}
