import { describe, expect, it, vi } from 'vitest'

import { createUnauthorizedWsEvents, WS_CLOSE_UNAUTHORIZED } from '../ws-auth'

describe('createUnauthorizedWsEvents', () => {
  // ROOT CAUSE:
  //
  // Throwing `createUnauthorizedError` inside the `upgradeWebSocket` factory
  // returns HTTP 401 before the upgrade completes. Browsers do not surface
  // that status to the WebSocket `close` event — clients only see
  // `code=1006` (abnormal closure), indistinguishable from a transient
  // network drop. VueUse's `useWebSocket.autoReconnect` then keeps retrying
  // the same stale token forever (the symptom captured in the original
  // `/ws/chat?token=...` 401 storm logs).
  //
  // Accepting the upgrade first and closing with 4001 in `onOpen` gives
  // the client a structured signal so its `onDisconnected` handler can
  // stop the reconnect loop until the URL (token) actually changes.
  it('closes the socket with WS_CLOSE_UNAUTHORIZED immediately on open', () => {
    const close = vi.fn<(code?: number, reason?: string) => void>()
    const events = createUnauthorizedWsEvents()

    // Hono's WSEvents allows partial maps; only onOpen is set here.
    expect(events.onOpen).toBeDefined()
    events.onOpen!(new Event('open'), { close } as any)

    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
    expect(WS_CLOSE_UNAUTHORIZED).toBe(4001)
  })
})
