import { JevOne, PointKernel } from 'jev-one';
import { VercelJevProvider } from 'jev-one/gateway';
import { pathToFileURL } from 'node:url';

export async function classifyMessage(jev) {
  return jev.vocabulary.answer({
    context: 'After I press Save, the app closes and my draft disappears.',
    question: 'Where should this message go?',
    vocabulary: [
      { id: 'bug', label: 'BUG', meaning: 'Existing behavior is broken.', payload: { type: 'meaning' } },
      { id: 'request', label: 'REQUEST', meaning: 'A new capability is wanted.', payload: { type: 'meaning' } },
      { id: 'unknown', label: 'NEEDS CONTEXT', meaning: 'There is not enough information to classify this message.', payload: { type: 'meaning' } },
    ],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('Set AI_GATEWAY_API_KEY before running this example.');
  const jev = new JevOne(new PointKernel(new VercelJevProvider({ apiKey })));
  const answer = await classifyMessage(jev);
  console.log({ word: answer.entry.label, meaning: answer.entry.meaning, weight: answer.decision.probability });
}
