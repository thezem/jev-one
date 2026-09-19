import type { PointKernel } from './kernel.js';
import type { PointResult, Posture } from './types.js';

const POSTURES: Record<Posture, { label: string; description: string }> = {
  talk: { label: 'TALK', description: 'Express something grounded in the current trace.' },
  choose: { label: 'CHOOSE', description: 'Make a bounded semantic or consequential judgment.' },
  act: { label: 'ACT', description: 'Attempt a legal transition through Navigator or Commander.' },
  wait: { label: 'WAIT', description: 'Request another observation before committing.' },
  stop: { label: 'STOP', description: 'End the loop and return control with the accumulated trace.' },
};

export class WillGate {
  readonly #kernel: PointKernel;
  constructor(kernel: PointKernel) { this.#kernel = kernel; }

  decide(goal: string, context: string, legalPostures: Posture[]): Promise<PointResult<Posture>> {
    const unique = [...new Set(legalPostures)];
    if (unique.length < 2) throw new Error('Will Gate requires at least two legal postures.');
    return this.#kernel.point({
      goal, context, question:'What kind of move should Jev make next?',module:'will',
      choices:unique.map((posture)=>({id:posture,label:POSTURES[posture].label,description:POSTURES[posture].description,kind:'control',value:posture})),
    });
  }
}
