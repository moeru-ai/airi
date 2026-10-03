import type { Ref } from 'vue'

import type { ComposerTranscription } from './transcription'

import { useStreamingTranscriptionInput } from '@proj-airi/stage-ui/composables/use-streaming-transcription-input'
import { onScopeDispose, watch } from 'vue'

/** Retains recognized words for manual sending or submits a stable draft after the configured delay. */
export function useTranscriptionDraft(options: {
  draft: Ref<string>
  enabled: Readonly<Ref<boolean>>
  delay: Readonly<Ref<number>>
  send: () => void
  sessionId?: Readonly<Ref<string>>
}) {
  const input = useStreamingTranscriptionInput(options.draft)
  let timeout: ReturnType<typeof setTimeout> | undefined

  function cancel() {
    if (timeout !== undefined)
      clearTimeout(timeout)
    timeout = undefined
  }

  function schedule() {
    cancel()
    if (!options.enabled.value || !options.draft.value.trim())
      return

    timeout = setTimeout(() => {
      timeout = undefined
      if (options.enabled.value)
        options.send()
    }, options.delay.value)
  }

  watch(options.enabled, (enabled) => {
    if (!enabled)
      cancel()
  }, { flush: 'sync' })
  watch(options.draft, cancel, { flush: 'sync' })
  if (options.sessionId) {
    watch(options.sessionId, () => {
      cancel()
      input.reset()
    }, { flush: 'sync' })
  }
  onScopeDispose(cancel)

  function append(text: string) {
    if (input.commit(text))
      schedule()
  }

  function update(text: string) {
    // Providers clear interim text immediately after a final result.
    if (text.trim())
      cancel()
    input.replace(text)
  }

  function receive(transcription: ComposerTranscription | undefined) {
    if (!transcription || transcription.sessionId !== options.sessionId?.value)
      return
    if (transcription.kind === 'final') {
      append(transcription.text)
    }
    else if (transcription.kind === 'interim') {
      update(transcription.text)
    }
    else if (transcription.kind === 'start') {
      cancel()
    }
    else if (transcription.kind === 'stop') {
      cancel()
      input.clear()
    }
    else {
      input.clear()
    }
  }

  return { cancel, append, update, clear: input.clear, receive }
}
