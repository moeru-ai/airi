import { shallowReadonly, shallowRef } from 'vue'

/** Incoming speech text waits for the composer that owns its chat session. */
const pending = shallowRef<Record<string, string>>({})

export const pendingHearingDrafts = shallowReadonly(pending)

/** Appends one transcription without merging text from different sessions. */
export function appendHearingDraft(sessionId: string, text: string): void {
  const trimmed = text.trim()
  if (!sessionId || !trimmed)
    return
  const previous = pending.value[sessionId]
  pending.value = {
    ...pending.value,
    [sessionId]: previous ? `${previous} ${trimmed}` : trimmed,
  }
}

/** Removes speech text only after the owning composer receives it. */
export function takeHearingDraft(sessionId: string): string {
  const text = pending.value[sessionId] ?? ''
  if (!text)
    return ''
  const next = { ...pending.value }
  delete next[sessionId]
  pending.value = next
  return text
}
