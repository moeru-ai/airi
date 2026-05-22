import type { WidgetsIframeEvent, WidgetsIframeInitPayload } from '@proj-airi/plugin-sdk-tamagotchi/widgets'

import type { BridgeTransport } from './hostBridge'

import { describe, expect, it, vi } from 'vitest'

import { createHostBridge } from './hostBridge'

/** A {@link BridgeTransport} fake that records outbound traffic and replays init payloads. */
function fakeTransport(): {
  transport: BridgeTransport
  published: WidgetsIframeEvent[]
  readyCount: () => number
  sendInit: (props: Record<string, unknown>) => void
} {
  let initHandler: ((payload: WidgetsIframeInitPayload) => void) | null = null
  const published: WidgetsIframeEvent[] = []
  let readyCount = 0
  return {
    transport: {
      emitReady: () => { readyCount += 1 },
      emitPublish: (event) => { published.push(event) },
      onInit: (handler) => { initHandler = handler },
      dispose: () => {},
    },
    published,
    readyCount: () => readyCount,
    sendInit: props => initHandler?.({ config: {}, props }),
  }
}

/** Resolves after the current microtask + timer queue, so command promises settle. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * @example
 * createHostBridge(transport, { onCommand }).requestAiTurn('Greet the student.')
 */
describe('createHostBridge', () => {
  /**
   * @example
   * expect(readyCount()).toBe(1)
   */
  it('announces readiness to the host on creation', () => {
    const { transport, readyCount } = fakeTransport()
    createHostBridge(transport, { onCommand: async () => ({}) })

    expect(readyCount()).toBe(1)
  })

  /**
   * @example
   * expect(published[0]).toEqual({ payload: { type: 'gamelet:ai-turn', request } })
   */
  it('publishes a gamelet:ai-turn envelope when an AI turn is requested', () => {
    const { transport, published } = fakeTransport()
    const bridge = createHostBridge(transport, { onCommand: async () => ({}) })

    const request = {
      headline: 'Chess — new game',
      instruction: 'Greet the student.',
      systemInstructions: ['Stay in character.'],
      fallbackText: '开局了。',
    }
    bridge.requestAiTurn(request)
    expect(published).toEqual([{ payload: { type: 'gamelet:ai-turn', request } }])
  })

  /**
   * @example
   * expect(published[0]).toEqual({ payload: { bestMove: 'e2e4', requestId: 'r1' } })
   */
  it('runs a forwarded command and publishes its result tagged with requestId', async () => {
    const { transport, published, sendInit } = fakeTransport()
    const onCommand = vi.fn().mockResolvedValue({ bestMove: 'e2e4' })
    createHostBridge(transport, { onCommand })

    sendInit({ command: { type: 'analyze_position', requestId: 'r1', fen: 'startpos' } })
    await flush()

    expect(onCommand).toHaveBeenCalledTimes(1)
    expect(published).toEqual([{ payload: { bestMove: 'e2e4', requestId: 'r1' } }])
  })

  /**
   * @example
   * expect(onCommand).toHaveBeenCalledTimes(1)
   */
  it('runs each forwarded command only once despite repeated init payloads', async () => {
    const { transport, sendInit } = fakeTransport()
    const onCommand = vi.fn().mockResolvedValue({})
    createHostBridge(transport, { onCommand })

    // The host re-sends the init payload on every prop change.
    sendInit({ command: { type: 'analyze_position', requestId: 'r1', fen: 'startpos' } })
    sendInit({ command: { type: 'analyze_position', requestId: 'r1', fen: 'startpos' } })
    await flush()

    expect(onCommand).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * expect(published[0]).toMatchObject({ payload: { requestId: 'r1', error: expect.any(String) } })
   */
  it('publishes an error envelope when a command handler rejects', async () => {
    const { transport, published, sendInit } = fakeTransport()
    const onCommand = vi.fn().mockRejectedValue(new Error('engine offline'))
    createHostBridge(transport, { onCommand })

    sendInit({ command: { type: 'explain_move', requestId: 'r1' } })
    await flush()

    expect(published).toEqual([{ payload: { requestId: 'r1', error: 'engine offline' } }])
  })

  /**
   * @example
   * expect(onCommand).not.toHaveBeenCalled()
   */
  it('ignores init payloads that carry no command', async () => {
    const { transport, published, sendInit } = fakeTransport()
    const onCommand = vi.fn().mockResolvedValue({})
    createHostBridge(transport, { onCommand })

    sendInit({})
    await flush()

    expect(onCommand).not.toHaveBeenCalled()
    expect(published).toHaveLength(0)
  })

  /**
   * @example
   * expect(onCommand).not.toHaveBeenCalled()
   */
  it('ignores init payloads whose command is malformed', async () => {
    const { transport, published, sendInit } = fakeTransport()
    const onCommand = vi.fn().mockResolvedValue({})
    createHostBridge(transport, { onCommand })

    // A non-object command, and an object missing the required `requestId`.
    sendInit({ command: 'analyze_position' })
    sendInit({ command: { type: 'analyze_position' } })
    await flush()

    expect(onCommand).not.toHaveBeenCalled()
    expect(published).toHaveLength(0)
  })
})
