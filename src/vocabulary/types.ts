import type { Effect, PointResult } from '../types.js';

export type VocabularyPayload =
  | { type: 'meaning'; value?: unknown }
  | { type: 'vocabulary'; target: string }
  | { type: 'capability'; target: string; input?: Record<string, unknown> }
  | { type: 'control'; action: 'continue' | 'stop' | 'wait' | 'ask' | 'unknown' };

export interface VocabularyEntry {
  id: string;
  label: string;
  meaning: string;
  aliases?: string[];
  tags?: string[];
  payload: VocabularyPayload;
  effects?: Effect[];
  reversible?: boolean;
  requiresApproval?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Vocabulary {
  id: string;
  label: string;
  description: string;
  entries: VocabularyEntry[];
  metadata?: Record<string, unknown>;
}

export interface VocabularyStep {
  vocabulary: Pick<Vocabulary, 'id' | 'label' | 'description'>;
  decision: PointResult<VocabularyEntry>;
}

export interface VocabularyAnswer {
  path: string[];
  entry: VocabularyEntry;
  decision: PointResult<VocabularyEntry>;
  steps: VocabularyStep[];
}
