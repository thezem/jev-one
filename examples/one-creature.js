import { JevOne, PointKernel } from '../dist/index.js'
import { VercelJevProvider } from '../dist/providers/gateway.js'

if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY. JEV ONE has no fallback provider.')

const one = new JevOne(new PointKernel(new VercelJevProvider({ apiKey: process.env.AI_GATEWAY_API_KEY })))
const goal = 'Understand what this situation calls for, then communicate the most useful meaning.'
const initial =
  'A builder has three separate successful Jev experiments and wants them to become one creature without losing their identities.'

const result = await one.orchestrator.run({
  goal,
  context: initial,
  legalPostures: ['choose', 'talk', 'wait', 'stop'],
  maxCycles: 4,
  handlers: {
    choose: async ({ context }) => {
      const answer = await one.oracle.ask(context, 'What universal operator should guide the next move?', goal)
      return {
        context: `${context}\n\n[ORACLE] ${answer.word.label}: ${answer.word.meaning}`,
        output: answer,
        legalPostures: ['talk', 'choose', 'stop'],
      }
    },
    talk: async ({ context }) => {
      const oracleLine = context.split('\n').findLast(line => line.startsWith('[ORACLE]')) ?? 'The system has accumulated a decision.'
      const speech = await one.voice.speak(goal, context, [
        { id: 'oracle', label: 'Oracle result', text: oracleLine.replace('[ORACLE] ', ''), source: 'decision' },
      ])
      console.log(`\nJEV SAYS: ${speech.text}\n`)
      return { context: `${context}\n\n[SPEECH] ${speech.text}`, output: speech, done: true }
    },
    wait: async ({ context }) => ({
      context: `${context}\n\n[OBSERVATION] No new external state arrived.`,
      legalPostures: ['choose', 'talk', 'stop'],
    }),
  },
})

console.log(
  JSON.stringify(
    {
      workflowId: result.workflowId,
      stoppedBy: result.stoppedBy,
      cycles: result.cycles.map(cycle => ({ cycle: cycle.index, posture: cycle.will.selected.value, probability: cycle.will.probability })),
    },
    null,
    2,
  ),
)
console.log(`Trace valid: ${one.kernel.ledger.verify()}`)
