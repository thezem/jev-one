import { createGateway } from '@ai-sdk/gateway';
import { experimental_evaluate as evaluate } from 'ai';
import type { JevProvider, ProviderPointRequest, ProviderPointResult } from '../types.js';

export interface GatewayProviderOptions {
  apiKey: string;
  model?: string;
}

interface InvalidChoiceData {
  selection?: {
    type?: unknown;
    choice?: unknown;
    probabilities?: unknown;
  };
}

/** Recover only the AI SDK failure where Jev returned a valid distribution but
 * its selected ID was not the distribution's highest-probability choice. */
export function recoverMismatchedChoice(error: unknown): ProviderPointResult | null {
  if (!(error instanceof Error) || !error.message.includes('did not select a highest-probability option')) return null;
  const data = (error as Error & { data?: InvalidChoiceData }).data;
  const selection = data?.selection;
  if (selection?.type !== 'choice' || typeof selection.probabilities !== 'object' || selection.probabilities === null) return null;
  const probabilities = Object.fromEntries(
    Object.entries(selection.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
  );
  const ranked = Object.entries(probabilities).sort((left, right) => right[1] - left[1]);
  const selected = ranked[0]?.[0];
  if (!selected) return null;
  return { selected, probabilities, usage: { recoveredChoiceMismatch: 1 } };
}

export class VercelJevProvider implements JevProvider {
  readonly id = 'vercel-ai-gateway:typesafe-ai/jev';
  readonly #gateway;
  readonly #model: string;

  constructor(options: GatewayProviderOptions) {
    if (!options.apiKey) throw new Error('VercelJevProvider requires an API key.');
    this.#gateway = createGateway({ apiKey: options.apiKey });
    this.#model = options.model ?? 'typesafe-ai/jev';
  }

  async point(request: ProviderPointRequest): Promise<ProviderPointResult> {
    try {
      const result = await evaluate({
        model: this.#gateway.evaluationModel(this.#model),
        state: request.state,
        questions: {
          selection: {
            type: 'choice',
            instructions: request.instructions ?? request.question,
            criteria: Object.fromEntries(request.choices.map((choice) => [
              choice.id,
              choice.criteria === undefined ? `${choice.label}: ${choice.description}` : choice.criteria,
            ])),
          },
        },
        ...(request.signal ? { abortSignal: request.signal } : {}),
      });
      const answer = result.answers.selection;
      if (answer.type !== 'choice') throw new Error('Jev returned a non-choice answer.');
      return {
        selected: answer.choice,
        probabilities: answer.probabilities ?? {},
        model: result.response.modelId,
        usage: result.usage as unknown as Record<string, number>,
      };
    } catch (error) {
      const recovered = recoverMismatchedChoice(error);
      if (recovered) return recovered;
      throw error;
    }
  }
}
