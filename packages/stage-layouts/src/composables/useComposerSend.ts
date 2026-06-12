import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Ref } from 'vue'

import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'

import { runComposerSend } from './runComposerSend'

/**
 * The composer state a surface owns; the composable wires it to the shared
 * send policy.
 */
export interface UseComposerSendOptions {
  /** The composer's draft text, cleared optimistically on send and rejoined on rescue. */
  messageInput: Ref<string>
  /** True while an IME composition is in progress, so Enter does not send mid-composition. */
  isComposing: Ref<boolean>
}

/**
 * The default text-only composer send for surfaces that send via direct
 * `ingest` and present a rescued draft as a lossless rejoin into the composer.
 *
 * Use when:
 * - A chat surface has a plain text composer with no attachments/draft chips
 *   (stage-web, stage-pocket). Surfaces with richer draft handling (the
 *   tamagotchi attachment/parked-draft flow) call {@link runComposerSend}
 *   directly instead.
 *
 * Expects:
 * - Called during component setup so the backing stores resolve once.
 *
 * Returns:
 * - `handleSend`: clears the draft, ingests it (rescuable), and on retract
 *   rejoins the rescued text ahead of anything retyped since the send; on
 *   failure appends an error row to the active session.
 */
export function useComposerSend(options: UseComposerSendOptions) {
  const { messageInput, isComposing } = options

  const providersStore = useProvidersStore()
  const chatSession = useChatSessionStore()
  const { ingest } = useChatOrchestratorStore()
  const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())

  async function handleSend() {
    if (!messageInput.value.trim() || isComposing.value)
      return

    const textToSend = messageInput.value
    messageInput.value = ''

    await runComposerSend({
      send: async () => ingest(textToSend, {
        chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
        model: activeModel.value,
        providerConfig: providersStore.getProviderConfig(activeProvider.value),
        // The composer rescues the text on retract, so it opts into rescuable.
        rescuable: true,
      }),
      // Lossless rejoin: prepend rescued text ahead of anything retyped since
      // the send.
      restoreDraft: () => {
        messageInput.value = [textToSend, messageInput.value.trim()].filter(Boolean).join(' ')
      },
      appendErrorRow: message => chatSession.appendSessionMessage(chatSession.activeSessionId, {
        role: 'error',
        content: message,
      }),
    })
  }

  return { handleSend }
}
