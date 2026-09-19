import type { PointKernel } from '../kernel.js'
import type { PointResult } from '../types.js'

export type SpeechAct = 'report' | 'ask' | 'warn' | 'propose' | 'refuse' | 'celebrate' | 'clarify'
export type SpeechStyle = 'concise' | 'neutral' | 'urgent' | 'curious'

export interface SpeechFact {
  id: string
  label: string
  text: string
  source: 'observed' | 'decision' | 'user' | 'derived'
}

export interface SpeechPlan {
  act: SpeechAct
  style: SpeechStyle
  fact: SpeechFact
  text: string
  decisions: {
    act: PointResult<SpeechAct>
    style: PointResult<SpeechStyle>
    fact: PointResult<SpeechFact> | null
  }
}

const acts: Array<{ id: SpeechAct; label: string; description: string; value: SpeechAct }> = [
  { id: 'report', label: 'Report', description: 'State an established observation or result.', value: 'report' },
  { id: 'ask', label: 'Ask', description: 'Request information needed to continue.', value: 'ask' },
  { id: 'warn', label: 'Warn', description: 'Foreground risk, conflict, or uncertainty.', value: 'warn' },
  { id: 'propose', label: 'Propose', description: 'Offer the selected next move without executing it.', value: 'propose' },
  { id: 'refuse', label: 'Refuse', description: 'State that a requested move is unavailable or disallowed.', value: 'refuse' },
  { id: 'celebrate', label: 'Celebrate', description: 'Acknowledge a verified success.', value: 'celebrate' },
  { id: 'clarify', label: 'Clarify', description: 'Restate a decision or distinction precisely.', value: 'clarify' },
]

const styles: Array<{ id: SpeechStyle; label: string; description: string; value: SpeechStyle }> = [
  { id: 'concise', label: 'Concise', description: 'Use the shortest complete expression.', value: 'concise' },
  { id: 'neutral', label: 'Neutral', description: 'Use calm factual expression.', value: 'neutral' },
  { id: 'urgent', label: 'Urgent', description: 'Lead with time-sensitive importance.', value: 'urgent' },
  { id: 'curious', label: 'Curious', description: 'Express uncertainty as an invitation to inspect or answer.', value: 'curious' },
]

const render = (act: SpeechAct, style: SpeechStyle, fact: SpeechFact): string => {
  const prefix = style === 'urgent' ? 'Important: ' : style === 'curious' ? 'I’m noticing this: ' : ''
  const body: Record<SpeechAct, string> = {
    report: fact.text,
    ask: `${fact.text} What should I know next?`,
    warn: `There is a risk or unresolved uncertainty: ${fact.text}`,
    propose: `I propose this next move: ${fact.text}`,
    refuse: `I cannot proceed with that move: ${fact.text}`,
    celebrate: `Verified success: ${fact.text}`,
    clarify: `To be precise: ${fact.text}`,
  }
  const text = `${prefix}${body[act]}`
  return style === 'concise' ? text.replace(/^(I’m noticing this: |To be precise: )/, '') : text
}

export class VoiceModule {
  readonly #kernel: PointKernel
  constructor(kernel: PointKernel) {
    this.#kernel = kernel
  }

  async speak(goal: string, context: string, facts: SpeechFact[]): Promise<SpeechPlan> {
    if (!facts.length) throw new Error('Voice requires at least one traceable fact.')
    const act = await this.#kernel.point({
      goal,
      context,
      question: 'Which speech act should Jev use now?',
      module: 'voice.act',
      choices: acts.map(item => ({ ...item, kind: 'speech' })),
    })
    const style = await this.#kernel.point({
      goal,
      context: `${context}\n\nSpeech act: ${act.selected.label}`,
      question: 'Which speaking style best fits this moment?',
      module: 'voice.style',
      choices: styles.map(item => ({ ...item, kind: 'speech' })),
    })
    let factDecision: PointResult<SpeechFact> | null = null
    let fact = facts[0]!
    if (facts.length > 1) {
      factDecision = await this.#kernel.point({
        goal,
        context: `${context}\n\nSpeech act: ${act.selected.label}`,
        question: 'Which established fact should Jev express?',
        module: 'voice.fact',
        choices: facts.map(item => ({
          id: item.id,
          label: item.label,
          description: `${item.text} Source: ${item.source}.`,
          kind: 'speech',
          value: item,
        })),
      })
      fact = factDecision.selected.value!
    }
    const speechAct = act.selected.value!
    const speechStyle = style.selected.value!
    return {
      act: speechAct,
      style: speechStyle,
      fact,
      text: render(speechAct, speechStyle, fact),
      decisions: { act, style, fact: factDecision },
    }
  }
}
