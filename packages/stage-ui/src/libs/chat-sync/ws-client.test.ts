import { describe, expect, it } from 'vitest'

import { buildChatWsUrl, computeReconnectDelay, mapStatus } from './ws-client'

describe('buildChatWsUrl', () => {
  /**
   * @example
   * "https://api.example.com" + "abc" → "wss://api.example.com/ws/chat?token=abc"
   */
  it('upgrades https → wss and appends /ws/chat with token query', () => {
    expect(buildChatWsUrl('https://api.example.com', 'abc')).toBe('wss://api.example.com/ws/chat?token=abc')
  })

  /**
   * @example
   * "http://localhost:3000" + "tok" → "ws://localhost:3000/ws/chat?token=tok"
   */
  it('upgrades http → ws on plain origins', () => {
    expect(buildChatWsUrl('http://localhost:3000', 'tok')).toBe('ws://localhost:3000/ws/chat?token=tok')
  })

  /**
   * @example
   * Trailing slashes on the server URL must not double up the path.
   */
  it('normalizes trailing slashes', () => {
    expect(buildChatWsUrl('https://api.example.com/', 'a')).toBe('wss://api.example.com/ws/chat?token=a')
    expect(buildChatWsUrl('https://api.example.com//', 'a')).toBe('wss://api.example.com/ws/chat?token=a')
  })

  /**
   * @example
   * URL-unsafe token characters get percent-encoded by URLSearchParams.
   */
  it('encodes tokens safely', () => {
    expect(buildChatWsUrl('https://api.example.com', 'a b+c=')).toBe('wss://api.example.com/ws/chat?token=a+b%2Bc%3D')
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
