import type { GameletAiTurnRequest, WidgetsIframeEvent, WidgetsIframeInitPayload } from '@proj-airi/plugin-sdk-tamagotchi/widgets'

import { errorMessageFrom } from '@moeru/std'
import { gameletAiTurnEventType } from '@proj-airi/plugin-sdk-tamagotchi/widgets'

/**
 * One tool request forwarded from the plugin host into the gamelet.
 *
 * The host appends `requestId` to the plugin tool's payload and delivers the
 * whole record through the iframe init props; the gamelet replies by
 * publishing a record carrying the same `requestId`.
 */
export interface BridgeCommand {
  /** Discriminates which gamelet operation to run, e.g. `analyze_position`. */
  type: string
  /** Correlation id the host uses to match the published response. */
  requestId: string
  /** Remaining command arguments; the command handler validates them. */
  [key: string]: unknown
}

/**
 * Minimal duplex contract the bridge needs from the host iframe channel.
 *
 * Production wires this to the `@moeru/eventa` window-message adapter; unit
 * tests wire a fake that records outbound traffic and replays init payloads.
 */
export interface BridgeTransport {
  /** Tells the host the gamelet is ready, prompting it to send the init payload. */
  emitReady: () => void
  /** Publishes one structured-clone-safe envelope up to the host. */
  emitPublish: (event: WidgetsIframeEvent) => void
  /** Subscribes to host init payloads (re-sent whenever host props change). */
  onInit: (handler: (payload: WidgetsIframeInitPayload) => void) => void
  /** Releases the underlying channel. */
  dispose: () => void
}

/**
 * Construction options for {@link createHostBridge}.
 */
export interface HostBridgeOptions {
  /** Runs one forwarded tool command and resolves with a JSON-safe result record. */
  onCommand: (command: BridgeCommand) => Promise<Record<string, unknown>>
}

/**
 * The gamelet's side of the iframe↔host bridge.
 */
export interface HostBridge {
  /** Asks the host to run one AI character turn from the given request. */
  requestAiTurn: (request: GameletAiTurnRequest) => void
  /** Tears down the underlying transport. */
  dispose: () => void
}

/** Narrows an init prop value to a {@link BridgeCommand}. */
function asBridgeCommand(value: unknown): BridgeCommand | null {
  if (!value || typeof value !== 'object')
    return null
  const record = value as Record<string, unknown>
  if (typeof record.type !== 'string' || typeof record.requestId !== 'string')
    return null
  return record as BridgeCommand
}

/**
 * Creates the gamelet host bridge over a {@link BridgeTransport}.
 *
 * Use when:
 * - The gamelet UI needs to publish its semantic events to the host and answer
 *   host-forwarded tool commands (`analyze_position`, `explain_move`)
 *
 * Expects:
 * - `transport` delivers each host init payload to the `onInit` handler; the
 *   host re-sends it whenever the forwarded command changes
 *
 * Returns:
 * - A {@link HostBridge}. On creation it announces readiness; each init payload
 *   carrying a not-yet-seen command is dispatched through
 *   {@link HostBridgeOptions.onCommand} and its result (or error) is published
 *   back tagged with the originating `requestId`. {@link HostBridge.requestAiTurn}
 *   publishes a `gamelet:ai-turn` envelope the host consumes to drive one AI turn.
 */
export function createHostBridge(transport: BridgeTransport, options: HostBridgeOptions): HostBridge {
  // Init payloads repeat on every host prop change; track handled commands so
  // one forwarded request runs exactly once.
  const handledRequestIds = new Set<string>()

  function dispatchCommand(command: BridgeCommand): void {
    options.onCommand(command)
      .then((result) => {
        transport.emitPublish({ payload: { ...result, requestId: command.requestId } })
      })
      .catch((commandError) => {
        transport.emitPublish({
          payload: { requestId: command.requestId, error: errorMessageFrom(commandError) ?? 'Gamelet command failed.' },
        })
      })
  }

  transport.onInit((payload) => {
    const command = asBridgeCommand(payload.props?.command)
    if (!command || handledRequestIds.has(command.requestId))
      return
    handledRequestIds.add(command.requestId)
    dispatchCommand(command)
  })

  // Announce readiness so the host sends the first init payload.
  transport.emitReady()

  return {
    requestAiTurn(request) {
      transport.emitPublish({ payload: { type: gameletAiTurnEventType, request } })
    },
    dispose() {
      transport.dispose()
    },
  }
}
