import { randomUUID } from 'node:crypto';
import type { PointKernel } from './kernel.js';
import type { PointResult, Posture } from './types.js';
import { WillGate } from './will.js';

export interface CycleResult {
  context?: string;
  output?: unknown;
  done?: boolean;
  legalPostures?: Posture[];
}

export interface OrchestrationCycle {
  index: number;
  will: PointResult<Posture>;
  result: CycleResult;
}

export interface OrchestrationRequest {
  goal: string;
  context: string;
  legalPostures: Posture[];
  maxCycles?: number;
  handlers: Partial<Record<Posture, (input: { goal: string; context: string; cycle: number; workflowId: string }) => Promise<CycleResult>>>;
}

export interface OrchestrationResult {
  workflowId: string;
  context: string;
  cycles: OrchestrationCycle[];
  stoppedBy: 'handler' | 'will_stop' | 'max_cycles';
}

export class JevOneOrchestrator {
  readonly #kernel: PointKernel;
  readonly #will: WillGate;
  constructor(kernel: PointKernel) { this.#kernel = kernel; this.#will = new WillGate(kernel); }

  async run(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const workflowId = randomUUID();
    const cycles: OrchestrationCycle[] = [];
    let context = request.context;
    let legal = request.legalPostures;
    const maxCycles = request.maxCycles ?? 8;
    for (let index = 1; index <= maxCycles; index += 1) {
      const available = legal.filter((posture) => posture === 'stop' || request.handlers[posture]);
      if (!available.includes('stop')) available.push('stop');
      if (available.length < 2) return { workflowId, context, cycles, stoppedBy:'handler' };
      const will = await this.#will.decide(request.goal, `${context}\n\nCycle: ${index} of ${maxCycles}`, available);
      const posture = will.selected.value!;
      if (posture === 'stop') {
        this.#kernel.ledger.append({workflowId,parentDecisionId:will.decisionId,type:'stop',module:'orchestrator',payload:{reason:'will_stop',cycle:index}});
        return { workflowId, context, cycles, stoppedBy:'will_stop' };
      }
      const handler = request.handlers[posture];
      if (!handler) throw new Error(`No handler is registered for posture ${posture}.`);
      const result = await handler({goal:request.goal,context,cycle:index,workflowId});
      cycles.push({index,will,result});
      if (result.context) context = result.context;
      if (result.legalPostures) legal = result.legalPostures;
      if (result.done) return { workflowId, context, cycles, stoppedBy:'handler' };
    }
    return { workflowId, context, cycles, stoppedBy:'max_cycles' };
  }
}
