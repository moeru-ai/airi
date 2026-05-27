import type { BridgeTransport } from './hostBridge'

import { createContext } from '@moeru/eventa/adapters/window-message'
import {
  widgetsIframeChannel,
  widgetsIframeInitEvent,
  widgetsIframePublishEvent,
  widgetsIframeReadyEvent,
} from '@proj-airi/plugin-sdk-tamagotchi/widgets'

/**
 * Builds the production {@link BridgeTransport} over the AIRI widgets iframe
 * channel.
 *
 * Use when:
 * - The gamelet runs inside the host's sandboxed iframe and needs the real
 *   `@moeru/eventa` window-message channel (pair with `createHostBridge`)
 *
 * Expects:
 * - Runs in a browser; the host window is reachable as `window.parent`
 *
 * Returns:
 * - A transport whose `emitReady`/`emitPublish` post to the host and whose
 *   `onInit` receives the host's init payloads.
 */
export function createEventaTransport(): BridgeTransport {
  const { context, dispose } = createContext({
    channel: widgetsIframeChannel,
    currentWindow: window,
    // The host embeds the gamelet, so the host window is the iframe's parent.
    targetWindow: () => window.parent,
    expectedSource: () => window.parent,
  })

  return {
    emitReady: () => context.emit(widgetsIframeReadyEvent, undefined),
    emitPublish: event => context.emit(widgetsIframePublishEvent, event),
    onInit: handler => context.on(widgetsIframeInitEvent, (event) => {
      if (event.body)
        handler(event.body)
    }),
    dispose,
  }
}
