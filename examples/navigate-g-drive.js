import { DEFAULT_COMMAND_GRAMMAR, JevOne, PointKernel } from '../dist/index.js'
import { VercelJevProvider } from '../dist/providers/gateway.js'
import { ReadonlyFilesystemEnvironment } from '../dist/node/index.js'

if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY. JEV ONE has no fallback provider.')
const one = new JevOne(new PointKernel(new VercelJevProvider({ apiKey: process.env.AI_GATEWAY_API_KEY })))
const goal =
  process.argv.slice(2).join(' ') || 'Find the jev-lab project inside G:\\Chats and propose inspecting it without changing anything.'
const environment = await ReadonlyFilesystemEnvironment.create({ root: 'G:\\', maxDepth: 4 })

const navigation = await one.navigator.run(goal, environment.initialState(), environment, { maxDepth: 4, maxSteps: 12, batchSize: 40 })
if (!navigation.target) throw new Error(`No target selected. Stop reason: ${navigation.reason}`)

const proposal = await one.commander.propose(
  goal,
  `Navigator selected real ${navigation.target.kind}: ${navigation.target.path}`,
  DEFAULT_COMMAND_GRAMMAR,
  [
    {
      id: 'selected',
      label: navigation.target.path,
      description: `Selected real ${navigation.target.kind}.`,
      reference: navigation.target.path,
    },
    { id: 'none', label: 'No target', description: 'Do not apply the operation to a target.', reference: null },
  ],
)

console.log(
  JSON.stringify(
    {
      target: navigation.target,
      navigationSteps: navigation.steps.map(step => step.selected.label),
      command: {
        family: proposal.family.label,
        operation: proposal.operation.label,
        target: proposal.target.label,
        dryRun: proposal.dryRun,
      },
      traceEvents: one.kernel.ledger.all().length,
      traceValid: one.kernel.ledger.verify(),
    },
    null,
    2,
  ),
)
