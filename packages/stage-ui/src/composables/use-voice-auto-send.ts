import type { MaybeRefOrGetter } from 'vue'

import { ref, toValue } from 'vue'

export interface UseVoiceAutoSendOptions {
  enabled: MaybeRefOrGetter<boolean>
  delayMs: MaybeRefOrGetter<number>
  sendText: (text: string) => Promise<void>
  onError?: (error: unknown) => void
}

export function appendVoiceTranscript(currentText: string, delta: string): string {
  const current = currentText.trim()
  const next = delta.trim()

  if (!next)
    return current

  return current ? `${current} ${next}` : next
}

export function useVoiceAutoSend(options: UseVoiceAutoSendOptions) {
  const pendingText = ref('')
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    if (!timeoutId)
      return

    clearTimeout(timeoutId)
    timeoutId = undefined
  }

  function clear() {
    clearTimer()
    pendingText.value = ''
  }

  async function flush() {
    clearTimer()

    if (!toValue(options.enabled)) {
      pendingText.value = ''
      return false
    }

    const text = pendingText.value.trim()
    if (!text) {
      pendingText.value = ''
      return false
    }

    pendingText.value = ''

    try {
      await options.sendText(text)
      return true
    }
    catch (error) {
      options.onError?.(error)
      pendingText.value = text
      return false
    }
  }

  function queue(delta: string) {
    if (!toValue(options.enabled)) {
      clear()
      return
    }

    pendingText.value = appendVoiceTranscript(pendingText.value, delta)
    if (!pendingText.value) {
      return
    }

    clearTimer()

    timeoutId = setTimeout(() => {
      void flush()
    }, Math.max(0, toValue(options.delayMs)))
  }

  function dispose() {
    clearTimer()
  }

  return {
    pendingText,
    clear,
    flush,
    queue,
    dispose,
  }
}
