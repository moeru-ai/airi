import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useHearingDraftStore } from '@proj-airi/stage-ui/stores/hearing-drafts'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { computed, shallowRef } from 'vue'

/** Claims drafts atomically before sending. Failed delivery restores text for its original session. */
export function useVoiceDraftEditor() {
  const drafts = useHearingDraftStore()
  const sessions = useChatSessionStore()
  const cards = useAiriCardStore()
  const chat = useChatStore()
  const sending = shallowRef(false)
  const error = shallowRef('')
  let edits = Promise.resolve()
  const sessionId = computed(() => drafts.pendingSessionIds.at(-1))
  const characterName = computed(() => cards.getCard(sessions.sessionMetas[sessionId.value ?? '']?.characterId ?? '')?.name ?? '')
  const text = computed(() => drafts.drafts[sessionId.value ?? ''] ?? '')

  function edit(value: string) {
    const owner = sessionId.value
    if (owner)
      edits = edits.then(() => drafts.edit(owner, value))
  }

  async function discard() {
    const owner = sessionId.value
    if (!owner || sending.value)
      return
    await edits
    await drafts.discard(owner)
    error.value = ''
  }

  async function send() {
    const owner = sessionId.value
    if (!owner || sending.value || !text.value.trim())
      return
    sending.value = true
    error.value = ''
    let claimed = ''
    let existingMessageIds: Set<string> | undefined
    try {
      await edits
      claimed = await drafts.take(owner)
      if (claimed.trim() && sessions.sessionMetas[owner]) {
        if (!await sessions.loadSession(owner))
          throw new Error('Could not load the voice draft session')
        existingMessageIds = new Set(sessions.sessionMessages[owner]?.flatMap(message => message.id ? [message.id] : []))
        if (sessions.sessionMetas[owner])
          await chat.send({ sessionId: owner, text: claimed.trim() })
      }
    }
    catch (cause) {
      // A persisted user turn owns its retry after the model fails.
      const knownMessageIds = existingMessageIds
      const accepted = knownMessageIds && sessions.sessionMessages[owner]?.some(message =>
        message.role === 'user'
        && !!message.id
        && !knownMessageIds.has(message.id)
        && message.content === claimed.trim())
      if (claimed && !accepted && sessions.sessionMetas[owner])
        await drafts.append(owner, claimed)
      error.value = errorMessageFrom(cause) ?? ''
    }
    finally {
      sending.value = false
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing)
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      void discard()
    }
    else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }
  return { drafts, sessionId, characterName, text, sending, error, edit, discard, send, handleKeydown }
}
