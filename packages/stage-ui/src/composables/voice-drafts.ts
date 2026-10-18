import type { SpeechSubmission } from '@proj-airi/core-agent'

import type { VoiceDraft } from '../services/speech/bus'
import type { ChatToolReference } from '../types/chat'

import { joinTranscriptSegments } from '@proj-airi/provider-inference'
import { ref } from 'vue'

import { useChatStore } from '../stores/chat'
import { useHearingStore } from '../stores/modules/hearing'

/**
 * Owns voice draft selection, source evidence, and submission to the chat runtime.
 * `tools` returns the tool references of a sent draft, read once at each send. Without tools, a draft sends none.
 */
export function useVoiceDrafts(report: (cause: unknown) => void, tools: () => readonly ChatToolReference[] | undefined) {
  const chat = useChatStore()
  const hearing = useHearingStore()
  const drafts = ref<VoiceDraft[]>([])
  const frontDraftId = ref<string>()
  const sending = new Map<string, ReturnType<typeof chat.submit>>()
  const sources = new Map<string, readonly SpeechSubmission[]>()

  function formatSpeechContext(submissions: readonly SpeechSubmission[] | undefined) {
    if (!submissions)
      return undefined

    // Speaker evidence stays out of the prompt. Its cosine has no calibrated threshold yet, and the model can read a low
    // score as another person. The speaker gate decides what the model receives. Until then, only the IO trace has it.
    const evidence = submissions.map(source => ({ context: source.context }))
    if (!evidence.some(item => item.context.length))
      return undefined

    // Prompt formatting is an application transport boundary. Plugin context keeps its typed values.
    return JSON.stringify(evidence, (_key, value: unknown) => {
      if (value instanceof Map)
        return [...value.entries()]
      if (value instanceof Set)
        return [...value]
      return typeof value === 'bigint' ? value.toString() : value
    })
  }

  async function acceptSpeech(submission: SpeechSubmission, signal: AbortSignal) {
    signal.throwIfAborted()
    const text = submission.text.trim()
    const existing = hearing.autoSendEnabled
      ? undefined
      : drafts.value.find(draft => draft.sessionId === submission.sessionId && !sending.has(draft.id))
    const id = existing?.id ?? submission.submissionId
    const previous = sources.get(id)
    const evidence = previous ? [...previous, submission] : [submission]
    const draft: VoiceDraft = {
      id,
      sessionId: submission.sessionId,
      rawText: evidence.map(source => source.transcript.raw.text).join('\n'),
      // Later speech continues the same paragraph. Presentation shows live speech with the same joining rule.
      text: joinTranscriptSegments([existing?.text ?? '', text]),
    }

    sources.set(id, evidence)
    drafts.value = [...drafts.value.filter(item => item.id !== id), draft]
    frontDraftId.value = id
    if (!hearing.autoSendEnabled || !text)
      return { status: 'drafted' as const, draftId: id }

    const receipt = await sendDraft(id, signal)
    return { status: 'committed' as const, messageId: receipt.messageId }
  }

  async function sendDraft(id: string, signal?: AbortSignal) {
    const pending = sending.get(id)
    if (pending)
      return pending
    const draft = drafts.value.find(item => item.id === id)
    if (!draft)
      throw new Error('Voice draft is unavailable')
    signal?.throwIfAborted()
    const turn = { sessionId: draft.sessionId, turnId: draft.id }
    const cancel = () => {
      void chat.cancelTurn(turn).catch(report)
    }

    const speechContext = formatSpeechContext(sources.get(id))
    // The send crosses windows as a synced action, so it takes a plain copy of the references.
    const requestTools = tools()?.map(tool => ({ ...tool }))
    signal?.addEventListener('abort', cancel, { once: true })
    markSending(id, true)
    const committed = chat.submit({ sessionId: draft.sessionId, messageId: draft.id, text: draft.text, speechContext, ...(requestTools ? { tools: requestTools } : {}) }).then((receipt) => {
      removeDraft(id)
      return receipt
    }).catch((error: unknown) => {
      // A failed send keeps the draft, so the user can edit it and send it again.
      markSending(id, false)
      throw error
    }).finally(() => {
      sending.delete(id)
      signal?.removeEventListener('abort', cancel)
    })
    sending.set(id, committed)
    return committed
  }

  /** Publishes the send state. Controls hide a draft while it is sent and show it again after a failure. */
  function markSending(id: string, value: boolean) {
    drafts.value = drafts.value.map(item => item.id === id ? { ...item, sending: value } : item)
  }

  function removeDraft(id: string) {
    drafts.value = drafts.value.filter(item => item.id !== id)
    sources.delete(id)
    if (frontDraftId.value === id)
      frontDraftId.value = drafts.value.at(-1)?.id
  }

  function discardDraft(id: string) {
    if (sending.has(id) || !drafts.value.some(item => item.id === id))
      return false
    removeDraft(id)
    return true
  }

  function editDraft(id: string, text: string) {
    const draft = drafts.value.find(item => item.id === id)
    if (!draft || sending.has(id))
      return false
    drafts.value = drafts.value.map(item => item.id === id ? { ...item, text } : item)
    return true
  }

  function selectDraft(id: string) {
    if (!drafts.value.some(draft => draft.id === id))
      return false
    frontDraftId.value = id
    return true
  }

  return { drafts, frontDraftId, acceptSpeech, sendDraft, discardDraft, editDraft, selectDraft }
}
