import type { JSONValue } from 'ai';

export type DecisionStrength = 'decisive' | 'preferred' | 'close' | 'diffuse';
export type ChoiceKind = 'meaning' | 'judgment' | 'transition' | 'navigation' | 'command' | 'control' | 'speech';
export type Posture = 'talk' | 'choose' | 'act' | 'wait' | 'stop';

/** Native input accepted by Jev's evaluation API. Strings remain the simplest
 * form; objects and arrays preserve structured instructions and criteria. */
export type JevInput = string | Readonly<Record<string, JSONValue>> | readonly JSONValue[];

export interface PointChoice<T = unknown> {
  id: string;
  label: string;
  description: string;
  kind?: ChoiceKind;
  value?: T;
  metadata?: Record<string, unknown>;
  /** Complete provider-facing criterion for this choice. When omitted, the
   * provider derives the criterion from label and description as before. */
  criteria?: JevInput | null;
}

export interface PointLimits {
  maxChoices?: number;
  deadlineMs?: number;
}

export interface PointRequest<T = unknown> {
  goal: string;
  context: string;
  question: string;
  /** Optional native structured state. The kernel retains goal as an envelope. */
  state?: JevInput;
  /** Optional native structured instructions. `question` remains the readable
   * trace label and backward-compatible fallback. */
  instructions?: JevInput;
  choices: PointChoice<T>[];
  module: string;
  limits?: PointLimits;
  trace?: {
    workflowId?: string;
    parentDecisionId?: string;
  };
}

export interface ProviderPointRequest {
  state: JevInput;
  question: string;
  instructions?: JevInput;
  choices: Array<Pick<PointChoice, 'id' | 'label' | 'description' | 'criteria'>>;
  signal?: AbortSignal;
}

export interface ProviderPointResult {
  selected: string;
  probabilities: Record<string, number>;
  model?: string;
  usage?: Record<string, number>;
}

/** A transport for the real TypeSafe AI Jev model. Implementations may change
 * endpoints or authentication, but must not substitute a heuristic or LLM. */
export interface JevProvider {
  readonly id: string;
  point(request: ProviderPointRequest): Promise<ProviderPointResult>;
}

export interface RankedChoice<T = unknown> {
  choice: PointChoice<T>;
  probability: number;
  rank: number;
}

export interface PointResult<T = unknown> {
  decisionId: string;
  workflowId: string;
  module: string;
  selected: PointChoice<T>;
  probability: number;
  distribution: Record<string, number>;
  ranking: RankedChoice<T>[];
  strength: DecisionStrength;
  margin: number;
  normalizedEntropy: number;
  provider: string;
  model?: string;
  elapsedMs: number;
}

export type Effect = 'none' | 'read' | 'navigate' | 'write' | 'copy' | 'rename' | 'delete' | 'execute' | 'network';

export interface CapabilityManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  postures: Posture[];
  effects: Effect[];
  forbiddenEffects?: Effect[];
  maxDepth?: number;
  metadata?: Record<string, unknown>;
}

export interface TraceEvent {
  id: string;
  workflowId: string;
  parentDecisionId?: string;
  at: string;
  type: 'point' | 'observation' | 'transition' | 'handoff' | 'speech' | 'stop';
  module: string;
  payload: Record<string, unknown>;
  previousHash: string;
  hash: string;
}
