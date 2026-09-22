import { fileURLToPath } from 'node:url';
import { JevOne, PointKernel } from '../dist/index.js';
import { VercelJevProvider } from '../dist/providers/gateway.js';

export async function routeTicket(jev, message) {
  return jev.cards.choose({
    context: { message },
    instructions: {
      question: 'Which team should handle this first?',
      focus: 'The customer main ask, not every topic mentioned.',
    },
    cards: [
      {
        id: 'billing',
        label: 'Billing',
        criteria: {
          what: ['charges', 'refunds', 'duplicate payments', 'invoices'],
          not_for: 'Delivery delays, tracking, or missing packages.',
          examples: ['I was charged twice.', 'I want a refund.'],
        },
        value: { team: 'billing' },
      },
      {
        id: 'shipping',
        label: 'Shipping',
        criteria: {
          what: ['tracking', 'delivery', 'missing packages', 'still processing'],
          not_for: 'The payment itself being wrong.',
          examples: ['Where is my order?', 'Tracking has not updated.'],
        },
        value: { team: 'shipping' },
      },
      {
        id: 'technical',
        label: 'Technical support',
        criteria: {
          what: ['login', 'application bugs', 'account access'],
          not_for: 'Normal order or payment issues.',
          examples: ['I cannot log in.', 'The site errors during checkout.'],
        },
        value: { team: 'technical' },
      },
    ],
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('Set AI_GATEWAY_API_KEY before running this example.');
  const jev = new JevOne(new PointKernel(new VercelJevProvider({ apiKey })));
  const message = process.argv.slice(2).join(' ') || 'My package is late and tracking has not updated.';
  const answer = await routeTicket(jev, message);
  console.log(JSON.stringify({
    selected: answer.id,
    value: answer.card.value,
    probability: answer.decision.probability,
    strength: answer.decision.strength,
    ranking: answer.decision.ranking.map(({ choice, probability }) => ({ id: choice.id, probability })),
  }, null, 2));
}
