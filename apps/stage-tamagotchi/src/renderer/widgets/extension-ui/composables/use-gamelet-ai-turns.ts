import type { GameletAiTurnRequest } from '@proj-airi/plugin-sdk-tamagotchi/widgets'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import { gameletAiTurnEventType } from '@proj-airi/plugin-sdk-tamagotchi/widgets'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { isPlainObject } from 'es-toolkit'

/**
 * Validates an untrusted iframe publish value as a {@link GameletAiTurnRequest}.
 *
 * The payload crosses the sandboxed-iframe boundary, so every field is checked
 * before use; a missing or non-string field rejects the whole request.
 */
function asAiTurnRequest(value: unknown): GameletAiTurnRequest | null {
  if (!isPlainObject(value))
    return null
  const { headline, instruction, fallbackText, systemInstructions } = value as Record<string, unknown>
  if (typeof headline !== 'string' || typeof instruction !== 'string' || typeof fallbackText !== 'string')
    return null
  if (instruction.trim() === '')
    return null
  if (!Array.isArray(systemInstructions) || !systemInstructions.every(line => typeof line === 'string'))
    return null
  // Safe after the array/element checks above.
  return { headline, instruction, fallbackText, systemInstructions: systemInstructions as string[] }
}

/**
 * Folds the gamelet's protocol and the per-event instruction into a single
 * message that the chat orchestrator will accept as a user turn.
 */
function buildIngestText(request: GameletAiTurnRequest): string {
  const protocol = request.systemInstructions.join('\n')
  return protocol
    ? `${protocol}\n\n${request.instruction}`
    : request.instruction
}

/**
 * Bridges gamelet-requested AI turns into the chat orchestrator so the active
 * character speaks them as a regular turn (visible message, Live2D, TTS).
 *
 * Use when:
 * - The extension-UI host receives publish events from a mounted gamelet iframe
 *   and some of them ask AIRI to react (e.g. a coaching gamelet narrating play)
 *
 * Expects:
 * - Called from a renderer component setup; reads the active provider/model
 *   from the consciousness store at the time each request arrives
 *
 * Returns:
 * - `handlePublish`: inspect one gamelet publish event and, when it is a
 *   `gamelet:ai-turn` request, ingest its instruction (prefixed by the gamelet's
 *   standing system instructions) as a chat turn. The gamelet owns all domain
 *   wording; this stays generic across gamelets.
 */
export function useGameletAiTurns(): { handlePublish: (event: Record<string, unknown>) => void } {
  const chatOrchestrator = useChatOrchestratorStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()

  // NOTICE:
  // The chat orchestrator keeps a single streaming-message slot, so a second
  // ingest fired while the first is mid-stream overwrites the first message
  // and the user sees output appear then vanish. Multiple gamelet events fire
  // close together (e.g. session_greeting + game_start on open, rapid moves),
  // so we drop new turns until the in-flight one finishes — favouring a clean
  // single reaction over half-written competing ones.
  // Source: packages/stage-ui/src/stores/chat.ts (single `streamingMessage`).
  // Removal condition: revisit once chat supports concurrent or queued turns.
  let busy = false

  async function ingestAiTurn(request: GameletAiTurnRequest): Promise<void> {
    if (busy) {
      console.warn('[useGameletAiTurns] busy, dropping ai-turn:', request.headline)
      return
    }

    const provider = consciousnessStore.activeProvider
    const model = consciousnessStore.activeModel
    if (!provider || !model) {
      console.warn('[useGameletAiTurns] no active provider/model; dropping ai-turn')
      return
    }

    let chatProvider: ChatProvider
    try {
      chatProvider = await providersStore.getProviderInstance<ChatProvider>(provider)
    }
    catch (error) {
      console.error('[useGameletAiTurns] failed to resolve chat provider:', errorMessageFrom(error))
      return
    }

    busy = true
    try {
      await chatOrchestrator.ingest(buildIngestText(request), { model, chatProvider })
    }
    catch (error) {
      console.error('[useGameletAiTurns] ingest failed:', errorMessageFrom(error))
    }
    finally {
      busy = false
    }
  }

  function handlePublish(event: Record<string, unknown>): void {
    const payload = event.payload
    if (!isPlainObject(payload) || payload.type !== gameletAiTurnEventType)
      return

    const request = asAiTurnRequest((payload as Record<string, unknown>).request)
    if (!request) {
      console.warn('[useGameletAiTurns] malformed request dropped', (payload as Record<string, unknown>).request)
      return
    }

    void ingestAiTurn(request)
  }

  return { handlePublish }
}
