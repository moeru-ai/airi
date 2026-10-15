import type { SpeechSubmission } from '@proj-airi/core-agent'
import type { PhoneticSuggestions } from '@proj-airi/stage-ui/libs/voice/voice-phonetic-match-plugin'

import { formatSpeechContext } from '@proj-airi/stage-ui/composables/voice-drafts'
import { PHONETIC_SUGGESTIONS_KEY } from '@proj-airi/stage-ui/libs/voice/voice-phonetic-match-plugin'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { onScopeDispose, shallowReactive } from 'vue'

/** The IO tracer keeps 50 turns, so older records have no turn to select. */
const MAX_RECORDS = 50

/** What one speech input of this window did, beyond its IO trace spans. */
export interface InputRecord {
  readonly inputId: string
  /** Milliseconds since the epoch. */
  readonly startTs: number
  /** Each raw transcript revision, as speech recognition streamed it. `final` marks a revision whose segments are all final. */
  readonly partials: readonly { readonly ts: number, readonly revision: number, readonly text: string, readonly final: boolean }[]
  /** The submission after the post-ASR plugins ran. A cancelled or failed input has none. */
  readonly submission?: SpeechSubmission
  /** The chat turn that the submission became: the committed message, or the draft that it joined. */
  readonly turnId?: string
}

/** The phonetic suggestions in the context of a submission, if the phonetic match plugin published any. */
export function suggestionsOf(submission: SpeechSubmission | undefined): PhoneticSuggestions['items'] {
  const value = submission?.context.find(item => item.key === PHONETIC_SUGGESTIONS_KEY)?.value
  return typeof value === 'object' && value !== null && 'items' in value && Array.isArray(value.items) ? value.items : []
}

/**
 * Records the speech inputs of this window's voice controller: the raw transcript revisions, the submission, and
 * the chat turn that it became.
 *
 * Only inputs of this window are recorded, so a turn of the main window host has no record. The record stays
 * after the input ends, so a selected turn shows what each stage received.
 * Scope disposal stops recording.
 */
export function useTurnRecorder() {
  const voice = useVoiceStore()
  const records = shallowReactive(new Map<string, InputRecord>())

  function update(inputId: string, change: (record: InputRecord) => Partial<InputRecord>) {
    const record = records.get(inputId)
    if (record)
      records.set(inputId, { ...record, ...change(record) })
  }

  const stopInputs = voice.controller.onInput((attempt) => {
    records.set(attempt.id, { inputId: attempt.id, startTs: Date.now(), partials: [] })
    while (records.size > MAX_RECORDS)
      records.delete(records.keys().next().value!)
    void attempt.done.then((outcome) => {
      if (outcome.status === 'committed')
        update(attempt.id, () => ({ turnId: outcome.messageId }))
      else if (outcome.status === 'drafted')
        update(attempt.id, () => ({ turnId: outcome.draftId }))
    })
  })

  // An observer plugin reads each raw revision. It writes nothing, so the turn does not change.
  // Ordered scheduling keeps every revision. The latest scheduling drops the ones that arrive while a callback runs.
  const plugin = voice.controller.use({ name: 'devtool-turn-recorder', setup(scope) {
    scope.onSpeechInput((input) => {
      input.subscribe({ transcript: 'raw', scheduling: 'ordered' }, async (ctx) => {
        const { revision, text, segments } = ctx.snapshot.transcript
        const final = segments.length > 0 && segments.every(segment => segment.final)
        // A context change sends the same revision again. Revision 0 comes before any recognition.
        update(input.inputId, record => revision === 0 || record.partials.at(-1)?.revision === revision
          ? {}
          : { partials: [...record.partials, { ts: Date.now(), revision, text, final }] })
      })
      return undefined
    })
    return undefined
  } })
  const stopSubmissions = voice.observeSubmissions(submission => update(submission.submissionId, () => ({ submission })))

  onScopeDispose(() => {
    stopInputs()
    stopSubmissions()
    void plugin.dispose()
  })

  /**
   * The `speechContext` that the chat turn of an input sends.
   * A dry-run draft can join several inputs, so the context holds the submissions of each of them, in order.
   */
  function speechContextOf(inputId: string) {
    const turnId = records.get(inputId)?.turnId
    if (!turnId)
      return undefined
    const submissions = [...records.values()].filter(record => record.turnId === turnId).flatMap(record => record.submission ? [record.submission] : [])
    return formatSpeechContext(submissions)
  }

  return { records, speechContextOf }
}

export type TurnRecorder = ReturnType<typeof useTurnRecorder>
