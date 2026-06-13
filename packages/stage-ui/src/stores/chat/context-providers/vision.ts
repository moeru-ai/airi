import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useVisionOrchestratorStore, useVisionProcessingStore } from '../../modules/vision'

// Prefix `vision:` so it matches the screen-vision awareness line added to the system prompt.
const VISION_CONTEXT_ID = 'vision:screen'

// The last screen description must be at most this fresh to inject. Background capture runs
// every few-to-tens of seconds; beyond this the description is stale (the user moved on), so
// we stop telling the persona what is on screen rather than report an old frame.
const FRESHNESS_MS = 60_000

/**
 * Runtime context provider that injects the latest screen description from background vision
 * capture into the chat prompt, locally — mirroring {@link createMinecraftContext}.
 *
 * Why local instead of the `context:update` channel: the desktop renderer both produces and
 * consumes this context. A `context:update` published over the server channel is not echoed
 * back to the sender, so the renderer never re-ingests its own vision context and the chat
 * never sees it. Reading the orchestrator's `lastResultText` directly each compose avoids the
 * round-trip entirely (the channel publish stays for devtools/observability only).
 *
 * Returns null when background capture is off, or when no fresh frame is available.
 */
export function createVisionContext(): ContextMessage | null {
  // Respect the opt-in: only inject screen context while background capture is enabled, matching
  // the VISION_AWARENESS_PROMPT gate in chat.ts. Without this, a devtools capture (whose default
  // is publish-off) or a frame left over from before the toggle was turned off would still leak
  // the persisted lastResultText into the next chat turn.
  const processing = useVisionProcessingStore()
  if (!processing.backgroundCaptureEnabled)
    return null

  const orchestrator = useVisionOrchestratorStore()
  const text = orchestrator.lastResultText.trim()
  const at = orchestrator.lastResultAt
  const fresh = !!text && at != null && Date.now() - at <= FRESHNESS_MS

  // Beyond freshness the description is stale (the user moved on), so drop it rather than report
  // an old frame.
  if (!fresh)
    return null

  return {
    id: nanoid(),
    contextId: VISION_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    // Framed as background/auxiliary so the persona uses it to understand context rather than
    // narrating it; the behavioural rules live in VISION_AWARENESS_PROMPT.
    text: `Screen (background context, do not narrate verbatim): ${text}`,
    createdAt: Date.now(),
  }
}
