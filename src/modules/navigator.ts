import { pointAcross } from '../hierarchical.js'
import type { PointKernel } from '../kernel.js'
import type { PointChoice, PointResult } from '../types.js'

export interface NavigationObservation<State, Transition, Target> {
  state: State
  summary: string
  choices: PointChoice<Transition>[]
  done?: boolean
  target?: Target
  depth?: number
}

export interface NavigationEnvironment<State, Transition, Target> {
  readonly id: string
  observe(state: State): Promise<NavigationObservation<State, Transition, Target>>
  transition(state: State, transition: Transition): Promise<State>
}

export interface NavigatorOptions {
  maxSteps?: number
  maxDepth?: number
  batchSize?: number
}

export interface NavigationStep<State, Transition> {
  index: number
  state: State
  selected: PointChoice<Transition>
  decision: PointResult<Transition> | null
  observation: string
}

export interface NavigationRun<State, Transition, Target> {
  finalState: State
  target?: Target
  done: boolean
  reason: 'environment_done' | 'max_steps' | 'max_depth'
  steps: NavigationStep<State, Transition>[]
}

export class NavigatorModule {
  readonly #kernel: PointKernel
  constructor(kernel: PointKernel) {
    this.#kernel = kernel
  }

  async run<State, Transition, Target>(
    goal: string,
    initialState: State,
    environment: NavigationEnvironment<State, Transition, Target>,
    options: NavigatorOptions = {},
  ): Promise<NavigationRun<State, Transition, Target>> {
    const maxSteps = options.maxSteps ?? 12
    const maxDepth = options.maxDepth ?? 4
    let state = initialState
    const steps: NavigationStep<State, Transition>[] = []
    for (let index = 1; index <= maxSteps; index += 1) {
      const observation = await environment.observe(state)
      if (observation.done)
        return {
          finalState: state,
          ...(observation.target !== undefined ? { target: observation.target } : {}),
          done: true,
          reason: 'environment_done',
          steps,
        }
      if ((observation.depth ?? 0) >= maxDepth && !observation.choices.some(choice => choice.kind === 'control')) {
        return { finalState: state, done: false, reason: 'max_depth', steps }
      }
      const history = steps.map(step => step.selected.label).join(' → ') || 'none'
      const pointed = await pointAcross(this.#kernel, {
        goal,
        context: `Environment: ${environment.id}\nCurrent observation: ${observation.summary}\nDepth: ${observation.depth ?? 'unknown'} of ${maxDepth}\nHistory: ${history}`,
        question: 'Which currently legal transition best advances or completes the goal?',
        choices: observation.choices,
        module: `navigator.${environment.id}`,
        ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
      })
      steps.push({
        index,
        state: structuredClone(state),
        selected: pointed.selected,
        decision: pointed.final,
        observation: observation.summary,
      })
      state = await environment.transition(state, pointed.selected.value as Transition)
    }
    return { finalState: state, done: false, reason: 'max_steps', steps }
  }
}
