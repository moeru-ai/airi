import type { SpeakerEvidence, SpeechInputAttempt, VoicePlugin } from '@proj-airi/core-agent'
import type { AudioRange, AudioWindow } from '@proj-airi/pipelines-audio'

/** The speaker ID of the device owner in speaker evidence. Only the owner can enroll a voiceprint. */
export const OWNER_SPEAKER_ID = 'owner'

/**
 * Each comparison covers 1 s of audio, and a new one starts every 250 ms.
 * These are the defaults of Sherpaw `similarity`, and Sherpaw tuned its focus threshold with them.
 * `latest` scheduling skips comparisons while the tracker Worker is busy, so a slow Worker cannot queue audio.
 */
const COMPARISON = { windowMs: 1000, hopMs: 250, scheduling: 'latest' } as const

/** A comparison counts when the VAD marked at least half of its audio as speech. Pauses then do not lower the score. */
const MIN_SPEECH_SHARE = 0.5

/** One VAD window that the voice activity plugin noted on an input. */
export interface SpeakerActivity {
  readonly inputId: string
  readonly range: AudioRange
  readonly speech: boolean
  readonly durationMs: number
}

/** New speaker evidence of one input. The host writes it to the input and traces it. */
export interface SpeakerEvidenceUpdate {
  readonly inputId: string
  /** From the start of the first counted comparison to the end of the last one. */
  readonly range: AudioRange
  /** The owner with the mean cosine of the counted comparisons, and the speech in `range`. */
  readonly value: Omit<SpeakerEvidence, 'revision'>
  /** The cosine of each counted comparison, in time order. */
  readonly scores: readonly number[]
}

export interface SpeakerEvidenceOptions {
  /** The plugin compares audio only while this returns true. */
  readonly enabled: () => boolean
  /** The cosine between the owner's voiceprint and one window. NaN when the window has no embedding, for example digital silence. */
  readonly compare: (window: AudioWindow, signal: AbortSignal) => Promise<number>
  /** The input that receives the evidence, usually the active input of the controller. */
  readonly input: () => Pick<SpeechInputAttempt, 'id' | 'acceptsEvidence'> | undefined
  /** Receives each update that adds a counted comparison. */
  readonly update: (update: SpeakerEvidenceUpdate) => void
}

/** A voice plugin that also receives the VAD results of the voice activity plugin. */
export interface SpeakerEvidencePlugin extends VoicePlugin {
  /** Records the VAD result of one window of an input. A comparison counts only after the VAD results reach its end. */
  noteActivity: (activity: SpeakerActivity) => void
}

interface Comparison {
  readonly range: AudioRange
  readonly score: number
}

/**
 * The comparisons and VAD results of one input.
 *
 * The VAD and the comparisons observe the same audio in separate observers, so either can run ahead.
 * A comparison waits in `pending` until the VAD results cover its end. Then its speech share decides if it counts.
 */
class InputEvidence {
  private readonly activity: SpeakerActivity[] = []
  private readonly pending: Comparison[] = []
  private readonly counted: Comparison[] = []

  constructor(readonly inputId: string) {}

  addActivity(activity: SpeakerActivity) {
    this.activity.push(activity)
  }

  addComparison(comparison: Comparison) {
    this.pending.push(comparison)
  }

  /** Decides the pending comparisons that the VAD now covers. Returns true when a comparison started to count. */
  settle(): boolean {
    const coveredTo = this.activity.at(-1)?.range.endFrame
    if (coveredTo === undefined)
      return false

    let added = false
    while (this.pending.length > 0 && this.pending[0].range.endFrame <= coveredTo) {
      const comparison = this.pending.shift()!
      if (Number.isFinite(comparison.score) && this.speechFrames(comparison.range) >= (comparison.range.endFrame - comparison.range.startFrame) * MIN_SPEECH_SHARE) {
        this.counted.push(comparison)
        added = true
      }
    }
    return added
  }

  /** The evidence of the counted comparisons. Undefined until a comparison counts. */
  evidence(): SpeakerEvidenceUpdate | undefined {
    const first = this.counted[0]
    const last = this.counted.at(-1)
    if (!first || !last)
      return undefined

    const range = { sourceId: first.range.sourceId, startFrame: first.range.startFrame, endFrame: last.range.endFrame }
    const scores = this.counted.map(comparison => comparison.score)
    const score = scores.reduce((sum, value) => sum + value, 0) / scores.length
    // Counted comparisons overlap by 750 ms, so the speech comes from the VAD windows inside the range, not from the comparisons.
    const voicedMs = this.activity
      .filter(item => item.speech && item.range.sourceId === range.sourceId && item.range.startFrame >= range.startFrame && item.range.endFrame <= range.endFrame)
      .reduce((sum, item) => sum + item.durationMs, 0)
    return { inputId: this.inputId, range, value: { candidates: [{ speakerId: OWNER_SPEAKER_ID, score }], voicedMs }, scores }
  }

  /** The frames of the range that the VAD marked as speech. */
  private speechFrames(range: AudioRange): number {
    let frames = 0
    for (const item of this.activity) {
      if (!item.speech || item.range.sourceId !== range.sourceId)
        continue
      frames += Math.max(0, Math.min(item.range.endFrame, range.endFrame) - Math.max(item.range.startFrame, range.startFrame))
    }
    return frames
  }
}

/**
 * Compares the speech of each input with the owner's voiceprint and reports the result as speaker evidence.
 *
 * The plugin only measures. It never begins, ends, or cancels an input. The host decides what the evidence changes.
 * It compares only audio inside the input, as `acceptsEvidence` of the input decides, and counts only comparisons
 * that are mostly speech. An input without VAD results, for example a manual input, therefore gets no evidence.
 */
export function createSpeakerEvidencePlugin(options: SpeakerEvidenceOptions): SpeakerEvidencePlugin {
  // The current input and the one before it. The last comparisons of an input can arrive after the next input begins.
  const inputs = new Map<string, InputEvidence>()

  function evidenceOf(inputId: string) {
    let evidence = inputs.get(inputId)
    if (!evidence) {
      evidence = new InputEvidence(inputId)
      inputs.set(inputId, evidence)
      const [oldest] = inputs.keys()
      if (inputs.size > 2)
        inputs.delete(oldest)
    }
    return evidence
  }

  function publish(evidence: InputEvidence) {
    if (!evidence.settle())
      return
    const update = evidence.evidence()
    if (update)
      options.update(update)
  }

  return {
    name: 'speaker-evidence',
    noteActivity(activity) {
      if (!options.enabled())
        return
      const evidence = evidenceOf(activity.inputId)
      evidence.addActivity(activity)
      publish(evidence)
    },
    setup(scope) {
      scope.observeAudio(COMPARISON, async (ctx) => {
        if (!options.enabled())
          return
        // A window before the start or after the end of the input is not its audio, and the input would reject it.
        const input = options.input()
        if (!input?.acceptsEvidence(ctx.window.range))
          return

        const score = await options.compare(ctx.window, ctx.signal)
        ctx.signal.throwIfAborted()
        const evidence = evidenceOf(input.id)
        evidence.addComparison({ range: ctx.window.range, score })
        publish(evidence)
      })
      return undefined
    },
  }
}
