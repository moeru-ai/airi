import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

const spanMock = vi.hoisted(() => ({
  addEvent: vi.fn(),
  end: vi.fn(),
  setAttribute: vi.fn(),
}))

const startSpanMock = vi.hoisted(() => vi.fn(() => spanMock))

vi.mock('../composables/use-io-tracer', () => ({
  activeTurnSpan: shallowRef(undefined),
  startSpan: startSpanMock,
}))

describe('useLlmStreamingControlStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    startSpanMock.mockClear()
    spanMock.addEvent.mockClear()
    spanMock.end.mockClear()
    spanMock.setAttribute.mockClear()
  })

  /**
   * @example
   * await store.dispatchWith('<|CALL ["plugin.action"]|>')
   * expect(startSpan).toHaveBeenCalledWith('Streaming control dispatch', ...)
   */
  it('records streaming control dispatch spans and call handler events', async () => {
    const { useLlmStreamingControlStore } = await import('./llm-streaming-control')
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
    const { useLlmStreamingControlStore } = await import('./llm-streaming-control')
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
