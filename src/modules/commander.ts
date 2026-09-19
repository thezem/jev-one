import type { PointKernel } from '../kernel.js'
import type { Effect, PointChoice, PointResult } from '../types.js'

export interface CommandOperation {
  id: string
  label: string
  description: string
  effect: Effect
  reversible: boolean
}

export interface CommandFamily {
  id: string
  label: string
  description: string
  operations: CommandOperation[]
}

export interface CommandGrammar {
  id: string
  families: CommandFamily[]
}

export interface CommandTarget {
  id: string
  label: string
  description: string
  reference: unknown
}

export interface CommandProposal {
  grammar: string
  family: CommandFamily
  operation: CommandOperation
  target: CommandTarget
  dryRun: true
  decisions: {
    family: PointResult<CommandFamily>
    operation: PointResult<CommandOperation>
    target: PointResult<CommandTarget> | null
  }
}

export class CommanderModule {
  readonly #kernel: PointKernel
  constructor(kernel: PointKernel) {
    this.#kernel = kernel
  }

  async propose(goal: string, context: string, grammar: CommandGrammar, targets: CommandTarget[]): Promise<CommandProposal> {
    if (!targets.length) throw new Error('Commander requires at least one legal target.')
    const family = await this.#kernel.point({
      goal,
      context,
      question: 'Which command family matches the requested intent?',
      module: 'commander.family',
      choices: grammar.families.map(item => ({
        id: item.id,
        label: item.label,
        description: item.description,
        kind: 'command',
        value: item,
      })),
    })
    const operation = await this.#kernel.point({
      goal,
      context: `${context}\n\nChosen family: ${family.selected.label}`,
      question: 'Which operation best matches the intent while preferring the least destructive adequate option?',
      module: 'commander.operation',
      choices: family.selected.value!.operations.map(item => ({
        id: item.id,
        label: item.label,
        description: `${item.description} Effect: ${item.effect}. Reversible: ${item.reversible}.`,
        kind: 'command',
        value: item,
      })),
    })
    let targetDecision: PointResult<CommandTarget> | null = null
    let target = targets[0]!
    if (targets.length > 1) {
      targetDecision = await this.#kernel.point({
        goal,
        context: `${context}\n\nProposed operation: ${operation.selected.label}`,
        question: 'Which legal target is the requested operation intended to affect?',
        module: 'commander.target',
        choices: targets.map(item => ({ id: item.id, label: item.label, description: item.description, kind: 'command', value: item })),
      })
      target = targetDecision.selected.value!
    }
    return {
      grammar: grammar.id,
      family: family.selected.value!,
      operation: operation.selected.value!,
      target,
      dryRun: true,
      decisions: { family, operation, target: targetDecision },
    }
  }
}

export const DEFAULT_COMMAND_GRAMMAR: CommandGrammar = {
  id: 'default',
  families: [
    {
      id: 'inspect',
      label: 'Inspect',
      description: 'Read, list, or describe without changing the target.',
      operations: [
        { id: 'read', label: 'Read', description: 'Read the target.', effect: 'read', reversible: true },
        { id: 'describe', label: 'Describe', description: 'Describe the target.', effect: 'read', reversible: true },
      ],
    },
    {
      id: 'navigate',
      label: 'Navigate',
      description: 'Move through an observed environment.',
      operations: [
        { id: 'enter', label: 'Enter', description: 'Enter the selected location.', effect: 'navigate', reversible: true },
        { id: 'return', label: 'Return', description: 'Return to the prior location.', effect: 'navigate', reversible: true },
      ],
    },
    {
      id: 'copy',
      label: 'Copy',
      description: 'Duplicate an item.',
      operations: [
        { id: 'copy', label: 'Copy', description: 'Propose duplicating the target.', effect: 'copy', reversible: true },
        { id: 'cancel_copy', label: 'Cancel', description: 'Propose no copy.', effect: 'none', reversible: true },
      ],
    },
    {
      id: 'modify',
      label: 'Modify',
      description: 'Change an existing item.',
      operations: [
        { id: 'rename', label: 'Rename', description: 'Propose renaming the target.', effect: 'rename', reversible: true },
        { id: 'edit', label: 'Edit', description: 'Propose editing the target.', effect: 'write', reversible: false },
        { id: 'cancel_modify', label: 'Cancel', description: 'Propose no modification.', effect: 'none', reversible: true },
      ],
    },
    {
      id: 'destructive',
      label: 'Destructive',
      description: 'Remove or overwrite data.',
      operations: [
        { id: 'trash', label: 'Move to trash', description: 'Propose recoverable removal.', effect: 'delete', reversible: true },
        { id: 'remove', label: 'Remove permanently', description: 'Propose permanent removal.', effect: 'delete', reversible: false },
        { id: 'cancel_destructive', label: 'Cancel', description: 'Propose no destructive action.', effect: 'none', reversible: true },
      ],
    },
    {
      id: 'finish',
      label: 'Finish',
      description: 'Take no further action.',
      operations: [
        { id: 'finish', label: 'Finish', description: 'End the workflow.', effect: 'none', reversible: true },
        { id: 'wait', label: 'Wait', description: 'Pause and request another observation.', effect: 'none', reversible: true },
      ],
    },
  ],
}
