import type { WSEvents } from 'hono/ws'

/**
 * Custom application close code (IANA private range 4000-4999) used to
 * signal "auth failed, do not reconnect with this token".
 *
 * Use when:
 * - Rejecting a WebSocket connection because the bearer token in the
 *   `?token=` query parameter is missing, invalid, expired, or revoked.
 *
 * Expects:
 * - Server: accept the upgrade first, then close with this code inside
 *   `onOpen`. Throwing inside `upgradeWebSocket` produces an HTTP 401
 *   that browsers swallow before the connection enters the WS state
 *   machine, leaving clients with only `code=1006` — indistinguishable
 *   from a transient network drop.
 * - Client: in `onDisconnected`, treat `ev.code === 4001` as a terminal
 *   auth failure for the current token and stop the autoReconnect loop
 *   until a fresh token rotates the URL.
 *
 * NOTICE:
 * - This constant is duplicated in
 *   `packages/stage-ui/src/libs/chat-sync/ws-client.ts` as
 *   `WS_CLOSE_UNAUTHORIZED`. The two MUST stay in sync; pulling a shared
 *   package in for one constant is more cost than risk here, so we
 *   document the contract on both sides instead.
 */
export const WS_CLOSE_UNAUTHORIZED = 4001

/**
 * Build a `WSEvents` shape that immediately closes the socket with
 * `WS_CLOSE_UNAUTHORIZED` after the upgrade completes.
 *
 * Use when:
 * - A `upgradeWebSocket(async (c) => ...)` factory has determined that
 *   the caller is not authenticated and wants to surface that to the
 *   client as a structured close code (not an HTTP 401 rejection of
 *   the upgrade itself).
 *
 * Returns:
 * - A `WSEvents` object with only `onOpen` populated. The hono/ws helper
 *   accepts partial event maps.
 */
export function createUnauthorizedWsEvents(): WSEvents {
  return {
    onOpen(_evt, ws) {
      ws.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
    },
  }
}
