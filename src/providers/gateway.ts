import { createGateway } from '@ai-sdk/gateway';
import { experimental_evaluate as evaluate } from 'ai';
import type { JevProvider, ProviderPointRequest, ProviderPointResult } from '../types.js';

export interface GatewayProviderOptions {
  apiKey: string;
  model?: string;
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
    const result = await evaluate({
      model: this.#gateway.evaluationModel(this.#model),
      state: request.state,
      questions: {
        selection: {
          type: 'choice',
          instructions: request.question,
          criteria: Object.fromEntries(request.choices.map((choice) => [choice.id, `${choice.label}: ${choice.description}`])),
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
  }
}
