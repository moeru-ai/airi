import type { Ref } from 'vue'

import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
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
  /** Captures the composer, then runs optional interruption work before sending. */
  submit: (beforeSend?: (sessionId: string) => Promise<void>) => Promise<void>
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
  const contextBridgeStore = useContextBridgeStore()
  const {
    interruptSpeakingFromChat,
    showStopSpeakingButton,
    stopSpeakingFromChat,
  } = useStopSpeakingButton()

  const responseActive = computed(() => options.generating.value || showStopSpeakingButton.value)
  const showStopAction = computed(() => responseActive.value && !options.hasSubmission.value)
  const responseSessionId = computed(() => contextBridgeStore.remoteStreamSessionId
    ?? chatStore.activeSendSessionId
    ?? options.sessionId.value)

  async function cancelGeneration(sessionId: string) {
    await Promise.all([
      contextBridgeStore.cancelRemoteStream(sessionId),
      chatStore.cancelPendingSends(sessionId),
    ])
  }

  async function stopActiveResponse() {
    const sessionId = responseSessionId.value
    stopSpeakingFromChat()
    await cancelGeneration(sessionId)
  }

  async function interruptBeforeSend() {
    const sessionId = responseSessionId.value
    interruptSpeakingFromChat()
    await cancelGeneration(sessionId)
  }

  async function submitInterruptingResponse() {
    await options.submit(responseActive.value ? interruptBeforeSend : undefined)
  }

  return {
    responseActive,
    showStopAction,
    stopActiveResponse,
    submitInterruptingResponse,
  }
}
