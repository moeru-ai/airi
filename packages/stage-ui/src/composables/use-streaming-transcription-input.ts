import type { Ref } from 'vue'

function joinInputAndTranscription(input: string, transcription: string) {
  return [input.trimEnd(), transcription.trim()].filter(Boolean).join(' ')
}

/**
 * Applies replaceable streaming transcription text to an editable input.
 * Manual input changes detach the current provider-owned suffix.
 */
export function useStreamingTranscriptionInput(input: Ref<string>) {
  let volatileTranscription = ''
  let volatileTranscriptionDetached = false

  function reset() {
    volatileTranscription = ''
    volatileTranscriptionDetached = false
  }

  function clear() {
    if (volatileTranscription && input.value.endsWith(volatileTranscription))
      input.value = input.value.slice(0, -volatileTranscription.length).trimEnd()

    reset()
  }

  function replace(text: string) {
    if (volatileTranscriptionDetached)
      return

    const nextTranscription = text.trim()
    if (!nextTranscription) {
      clear()
      return
    }

    if (!volatileTranscription) {
      volatileTranscription = nextTranscription
      input.value = joinInputAndTranscription(input.value, nextTranscription)
      return
    }

    if (!input.value.endsWith(volatileTranscription)) {
      volatileTranscriptionDetached = true
      volatileTranscription = ''
      return
    }

    const stableInput = input.value.slice(0, -volatileTranscription.length)
    volatileTranscription = nextTranscription
    input.value = joinInputAndTranscription(stableInput, nextTranscription)
  }

  function commit(text: string) {
    if (volatileTranscriptionDetached) {
      reset()
      return false
    }

    const finalTranscription = text.trim()
    if (!finalTranscription) {
      clear()
      return false
    }

    if (!volatileTranscription) {
      input.value = joinInputAndTranscription(input.value, finalTranscription)
      return true
    }

    if (!input.value.endsWith(volatileTranscription)) {
      reset()
      return false
    }

    const stableInput = input.value.slice(0, -volatileTranscription.length)
    input.value = joinInputAndTranscription(stableInput, finalTranscription)
    reset()
    return true
  }

  return {
    clear,
    commit,
    replace,
    reset,
  }
}
