import { JevOne, PointKernel } from 'jev-one';
import { VercelJevProvider } from 'jev-one/gateway';
import { pathToFileURL } from 'node:url';

// An in-memory world: handlers have no filesystem, network, or shell effects.
const map = {
  home: ['workshop', 'garden'],
  workshop: ['home', 'archive'],
  garden: ['home', 'archive'],
  archive: ['workshop', 'garden'],
};
const stop = { id: 'stop', label: 'STOP', meaning: 'Stop if no useful move is possible. Stopping alone does not deliver the notebook.', payload: { type: 'control', action: 'stop' } };
const verb = (id, label, meaning) => ({ id, label, meaning, payload: { type: 'capability', target: `courier.${id}` }, effects: ['none'] });

export async function deliverNotebook(jev, { direction = '', onTurn = () => {}, onDecision = () => {}, signal } = {}) {
  const goal = `Pick up the notebook at the archive and deliver it to home. ${direction}`;

  jev.capabilities.register({
    id: 'courier.move', description: 'Move to a connected place in memory.', effects: ['none'],
    async handler({ state, context }) {
      const answer = await jev.numbers.choose({
        goal,
        context: `${context}\nMap: ${JSON.stringify(map)}\nCurrent place: ${state.location}. Carrying notebook: ${state.carrying}. ${state.carrying ? 'The notebook is already picked up. Its destination is home.' : 'The notebook is waiting at the archive.'}`,
        question: 'Which adjacent place advances the goal?',
        items: [
          ...map[state.location].map(location => ({ label: location, description: `Connected onward to ${map[location].join(', ')}.`, value: location })),
          { label: 'Stay here', description: 'Cancel movement to take a useful action at the current place.', value: state.location },
        ],
      });
      return { state: { ...state, location: answer.item.value }, observation: `Moved from ${state.location} to ${answer.item.value}; Jev pointed to ${answer.number}.` };
    },
  });
  jev.capabilities.register({
    id: 'courier.pickup', description: 'Pick up the notebook.', effects: ['none'],
    handler({ state }) {
      if (state.location !== 'archive' || state.carrying || state.delivered) throw new Error('The notebook is not available here.');
      return { state: { ...state, carrying: true }, observation: 'Picked up the notebook. It now needs to go home.' };
    },
  });
  jev.capabilities.register({
    id: 'courier.deliver', description: 'Deliver the notebook at home.', effects: ['none'],
    handler({ state }) {
      if (state.location !== 'home' || !state.carrying) throw new Error('Delivery requires the notebook at home.');
      return { state: { ...state, carrying: false, delivered: true }, observation: 'The notebook is on the home desk.' };
    },
  });

  return jev.runtime.run({
    goal,
    context: `Map: ${JSON.stringify(map)}. Each connection works both ways. The notebook starts at the archive.`,
    state: { location: 'home', carrying: false, delivered: false },
    root(state) {
      const entries = [verb('move', 'MOVE', 'Choose a connected place from a numbered board.'), stop];
      if (state.location === 'archive' && !state.carrying && !state.delivered) entries.push(verb('pickup', 'PICK UP', 'Take the notebook here before returning home.'));
      if (state.location === 'home' && state.carrying) entries.push(verb('deliver', 'DELIVER', 'Put the carried notebook on the home desk.'));
      jev.vocabularies.register({ id: 'courier', label: 'Courier', description: 'Actions available in the observed world.', entries });
      return 'courier';
    },
    policy: { maxTurns: 16, maxRepeatedState: 2, allowedEffects: ['none'] },
    verifyCompletion: state => state.delivered,
    onDecision,
    onTurn,
    ...(signal ? { signal } : {}),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('Set AI_GATEWAY_API_KEY before running this example.');
  const jev = new JevOne(new PointKernel(new VercelJevProvider({ apiKey })));
  const result = await deliverNotebook(jev, {
    direction: process.argv.slice(2).join(' '),
    onTurn: turn => console.log(`${turn.turn}. ${turn.answer.entry.label} — ${turn.observation}`),
  });
  console.log(JSON.stringify({ done: result.done, reason: result.reason, state: result.state, points: jev.kernel.ledger.all().length, traceValid: jev.kernel.ledger.verify() }, null, 2));
  if (!result.done) process.exitCode = 2;
}
