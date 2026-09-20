import type { Ref } from 'vue'

import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { computed } from 'vue'

import { useStopSpeakingButton } from './useStopSpeakingButton'

/** State and actions that define interruption behavior for one chat composer. */
export interface ChatInterruptionOptions {
  /** Session that owns the active response and receives the next submission. */
  sessionId: Readonly<Ref<string>>
  /** True while the session owns an active LLM request. */
  generating: Readonly<Ref<boolean>>
  /** True when the composer contains text or an attachment that can be sent. */
  hasSubmission: Readonly<Ref<boolean>>
  /** Submits the current composer contents after active work is cancelled. */
  submit: () => Promise<void>
}

/**
 * Coordinates LLM cancellation, TTS cancellation, and replacement sends.
 *
 * The stop action appears only when a response is active and the composer is
 * empty. A new draft replaces the stop action with send. Sending that draft
 * cancels the active response before it submits the next turn.
 */
export function useChatInterruption(options: ChatInterruptionOptions) {
  const chatStore = useChatStore()
  const {
    interruptSpeakingFromChat,
    showStopSpeakingButton,
    stopSpeakingFromChat,
  } = useStopSpeakingButton()

  const responseActive = computed(() => options.generating.value || showStopSpeakingButton.value)
  const showStopAction = computed(() => responseActive.value && !options.hasSubmission.value)

  async function cancelGeneration() {
    await chatStore.cancelPendingSends(options.sessionId.value)
  }

  async function stopActiveResponse() {
    stopSpeakingFromChat()
    await cancelGeneration()
  }

  async function submitInterruptingResponse() {
    if (responseActive.value) {
      interruptSpeakingFromChat()
      await cancelGeneration()
    }

    await options.submit()
  }

  return {
    responseActive,
    showStopAction,
    stopActiveResponse,
    submitInterruptingResponse,
  }
}
