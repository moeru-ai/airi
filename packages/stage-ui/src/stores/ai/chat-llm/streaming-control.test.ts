import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spanMock = vi.hoisted(() => ({
  addEvent: vi.fn(),
  end: vi.fn(),
  setAttribute: vi.fn(),
}))

const startSpanMock = vi.hoisted(() => vi.fn(() => spanMock))
const turnSpans = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../../../composables/use-io-tracer', () => ({
  startSpan: startSpanMock,
  turnSpanOf: (turnId: string | undefined) => turnId ? turnSpans.get(turnId) : undefined,
}))

describe('useLlmStreamingControlStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    startSpanMock.mockClear()
    spanMock.addEvent.mockClear()
    spanMock.end.mockClear()
    spanMock.setAttribute.mockClear()
  })

  it('records a dispatch under the turn that it names, not under another turn that runs at the same time', async () => {
    const { useLlmStreamingControlStore } = await import('./streaming-control')
    const store = useLlmStreamingControlStore()
    const alice = { name: 'alice turn' }
    turnSpans.set('alice-turn', alice)
    turnSpans.set('bob-turn', { name: 'bob turn' })
    try {
      await store.dispatchWith('<|DELAY:1|>', { turnId: 'alice-turn' })
      await store.dispatchWith('<|DELAY:1|>', { turnId: 'turn-in-another-window' })
    }
    finally {
      turnSpans.clear()
    }

    expect(startSpanMock.mock.calls.map(call => (call as unknown[])[1])).toEqual([alice, undefined])
  })

  /**
   * @example
   * await store.dispatchWith('<|CALL ["plugin.action"]|>')
   * expect(startSpan).toHaveBeenCalledWith('Streaming control dispatch', ...)
   */
  it('records streaming control dispatch spans and call handler events', async () => {
    const { useLlmStreamingControlStore } = await import('./streaming-control')
    const store = useLlmStreamingControlStore()
    const handler = vi.fn()

    store.on({
      name: 'plugin.action',
      prompt: 'Run the plugin action.',
    }, handler)

    await expect(store.dispatchWith('<|CALL ["plugin.action"]|>')).resolves.toBe(true)

    expect(startSpanMock).toHaveBeenCalledWith(
      IOSpanNames.StreamingControlDispatch,
      undefined,
      expect.objectContaining({
        [IOAttributes.StreamingControlTokenLength]: '<|CALL ["plugin.action"]|>'.length,
        [IOAttributes.Subsystem]: IOSubsystems.StreamingControl,
      }),
    )
    expect(spanMock.setAttribute).toHaveBeenCalledWith(IOAttributes.StreamingControlParserName, 'CALL')
    expect(spanMock.setAttribute).toHaveBeenCalledWith(IOAttributes.StreamingControlTokenType, 'call')
    expect(spanMock.setAttribute).toHaveBeenCalledWith(IOAttributes.StreamingControlCallName, 'plugin.action')
    expect(spanMock.setAttribute).toHaveBeenCalledWith(IOAttributes.StreamingControlHandlerCount, 1)
    expect(spanMock.addEvent).toHaveBeenCalledWith(
      IOEvents.StreamingControlParsed,
      expect.objectContaining({
        [IOAttributes.StreamingControlTokenType]: 'call',
      }),
    )
    expect(spanMock.addEvent).toHaveBeenCalledWith(
      IOEvents.StreamingControlHandlerStart,
      expect.objectContaining({
        [IOAttributes.StreamingControlCallName]: 'plugin.action',
      }),
    )
    expect(spanMock.addEvent).toHaveBeenCalledWith(
      IOEvents.StreamingControlHandlerEnd,
      expect.objectContaining({
        [IOAttributes.StreamingControlCallName]: 'plugin.action',
      }),
    )
    expect(spanMock.end).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * await store.dispatchWith('<|CALL []|>')
   * expect(span.addEvent).toHaveBeenCalledWith(IOEvents.StreamingControlRejected, ...)
   */
  it('records rejected streaming control dispatches', async () => {
    const { useLlmStreamingControlStore } = await import('./streaming-control')
    const store = useLlmStreamingControlStore()

    await expect(store.dispatchWith('<|CALL []|>')).resolves.toBe(false)

    expect(spanMock.addEvent).toHaveBeenCalledWith(
      IOEvents.StreamingControlRejected,
      expect.objectContaining({
        [IOAttributes.StreamingControlReason]: 'parse-failed',
      }),
    )
    expect(spanMock.end).toHaveBeenCalledTimes(1)
  })
})
