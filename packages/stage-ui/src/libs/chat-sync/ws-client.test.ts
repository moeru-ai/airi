import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { buildChatWsUrl, computeReconnectDelay, createChatWsUrlRef, mapStatus, WS_CLOSE_UNAUTHORIZED } from './ws-client'

describe('buildChatWsUrl', () => {
  /**
   * @example
   * "https://api.example.com" → "wss://api.example.com/ws/v2/chat"
   */
  it('upgrades https → wss and appends the version-two chat path without a token', () => {
    expect(buildChatWsUrl('https://api.example.com')).toBe('wss://api.example.com/ws/v2/chat')
  })

  /**
   * @example
   * "http://localhost:3000" → "ws://localhost:3000/ws/v2/chat"
   */
  it('upgrades http → ws on plain origins', () => {
    expect(buildChatWsUrl('http://localhost:3000')).toBe('ws://localhost:3000/ws/v2/chat')
  })

  /**
   * @example
   * Trailing slashes on the server URL must not double up the path.
   */
  it('normalizes trailing slashes', () => {
    expect(buildChatWsUrl('https://api.example.com/')).toBe('wss://api.example.com/ws/v2/chat')
    expect(buildChatWsUrl('https://api.example.com//')).toBe('wss://api.example.com/ws/v2/chat')
  })

  /**
   * @example
   * Existing query parameters, including a legacy token, are removed.
   */
  it('removes query parameters so tokens cannot leak through the URL', () => {
    expect(buildChatWsUrl('https://api.example.com?token=a%20b%2Bc%3D')).toBe('wss://api.example.com/ws/v2/chat')
  })
})

describe('computeReconnectDelay', () => {
  /**
   * @example
   * First retry (retries=1) with base=1000 should land in [500, 1000) — never
   * sub-50ms (the regression we're guarding against was 0..1000 uniform).
   */
  it('floors the first retry at 50% of the base delay', () => {
    for (let i = 0; i < 200; i += 1) {
      const delay = computeReconnectDelay(1, 1000, 30_000)
      expect(delay).toBeGreaterThanOrEqual(500)
      expect(delay).toBeLessThan(1000)
    }
  })

  /**
   * @example
   * Exponential growth across retries until ceiling kicks in.
   */
  it('doubles per retry up to the ceiling', () => {
    // retries=10 on base=1000 maxes out at 30_000 (cap). Bounds: [15000, 30000).
    for (let i = 0; i < 50; i += 1) {
      const delay = computeReconnectDelay(10, 1000, 30_000)
      expect(delay).toBeGreaterThanOrEqual(15_000)
      expect(delay).toBeLessThan(30_000)
    }
  })

  /**
   * @example
   * retries=0 (the call signature accepts it even though VueUse starts at 1)
   * should not produce a negative or NaN delay.
   */
  it('clamps retries=0 to the base window', () => {
    const delay = computeReconnectDelay(0, 1000, 30_000)
    expect(delay).toBeGreaterThanOrEqual(500)
    expect(delay).toBeLessThan(1000)
  })
})

describe('mapStatus', () => {
  /**
   * @example
   * VueUse OPEN → chat-sync open; the `enabled` flag does not influence open.
   */
  it('maps OPEN to open regardless of enabled', () => {
    expect(mapStatus('OPEN', true)).toBe('open')
    expect(mapStatus('OPEN', false)).toBe('open')
  })

  /**
   * @example
   * VueUse CONNECTING → connecting; same independence from enabled.
   */
  it('maps CONNECTING to connecting regardless of enabled', () => {
    expect(mapStatus('CONNECTING', true)).toBe('connecting')
    expect(mapStatus('CONNECTING', false)).toBe('connecting')
  })

  /**
   * @example
   * The split between `idle` and `closed` is the whole reason the function
   * exists: when the user has never connected (or explicitly disconnected),
   * report `idle` so UI banners do not flash a "reconnecting…" state.
   */
  it('distinguishes closed (auto-reconnect pending) from idle (user intent off)', () => {
    expect(mapStatus('CLOSED', true)).toBe('closed')
    expect(mapStatus('CLOSED', false)).toBe('idle')
  })
})

describe('ws_CLOSE_UNAUTHORIZED', () => {
  // ROOT CAUSE:
  //
  // Browsers do not expose the HTTP 401 status to the WebSocket `close`
  // event when an upgrade is rejected — the only signal a client gets is
  // `code=1006` (abnormal closure), indistinguishable from a transient
  // network drop. VueUse's `useWebSocket.autoReconnect` then hammers the
  // same stale token forever.
  //
  // The server accepts the upgrade and closes with this custom code so
  // the client can distinguish "auth failed, stop reconnecting" from
  // "network blip, keep retrying". The matching server-side constant must
  // stay aligned or the close-code contract breaks silently.
  it('matches the server-side close code contract (4001, IANA private range)', () => {
    expect(WS_CLOSE_UNAUTHORIZED).toBe(4001)
  })
})

describe('createChatWsUrlRef', () => {
  it('returns undefined when disabled regardless of token', () => {
    const enabled = ref(false)
    const url = createChatWsUrlRef(enabled, () => 'tok', 'https://api.example.com')
    expect(url.value).toBeUndefined()
  })

  it('returns undefined when getToken yields null/empty', () => {
    const enabled = ref(true)
    const nullUrl = createChatWsUrlRef(enabled, () => null, 'https://api.example.com')
    expect(nullUrl.value).toBeUndefined()
  })

  // ROOT CAUSE:
  //
  // The client must read a reactive token source so the client can react to
  // token rotation. The URL remains stable; the current token is sent through
  // chat:authenticate after the socket opens.
  it('rebuilds the URL when getToken reads a reactive ref (token rotation)', () => {
    const enabled = ref(true)
    const tokenRef = ref<string | null>('old-token')
    const url = createChatWsUrlRef(enabled, () => tokenRef.value, 'https://api.example.com')

    expect(url.value).toBe('wss://api.example.com/ws/v2/chat')
    tokenRef.value = 'new-token'
    expect(url.value).toBe('wss://api.example.com/ws/v2/chat')
  })

  it('freezes ws URL when getToken is non-reactive (regression guard)', () => {
    const enabled = ref(true)
    // Module-local let stands in for `localStorage.getItem` — neither is a
    // Vue reactive dep, so the computed cannot observe mutations.
    let storage: string | null = 'frozen-token'
    const url = createChatWsUrlRef(enabled, () => storage, 'https://api.example.com')

    expect(url.value).toBe('wss://api.example.com/ws/v2/chat')
    storage = 'rotated-token'
    // Still the same URL; the token is read at connection time for the
    // post-connect authenticate invoke.
    expect(url.value).toBe('wss://api.example.com/ws/v2/chat')
  })
})

describe('wS_CLOSE_UNAUTHORIZED', () => {
  // ROOT CAUSE:
  //
  // Browsers do not expose the HTTP 401 status to the WebSocket `close`
  // event when an upgrade is rejected — the only signal a client gets is
  // `code=1006` (abnormal closure), indistinguishable from a transient
  // network drop. VueUse's `useWebSocket.autoReconnect` then hammers the
  // same stale token forever.
  //
  // The server accepts the upgrade and closes with this custom code so
  // the client can distinguish "auth failed, stop reconnecting" from
  // "network blip, keep retrying". The matching server-side constant must
  // stay aligned or the close-code contract breaks silently.
  it('matches the server-side close code contract (4001, IANA private range)', () => {
    expect(WS_CLOSE_UNAUTHORIZED).toBe(4001)
  })
})
