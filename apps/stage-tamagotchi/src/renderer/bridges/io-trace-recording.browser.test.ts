import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'
import type { ReadableSpan } from '@proj-airi/stage-ui/composables/use-io-tracer'

import { createContext, defineInvokeHandler } from '@moeru/eventa'
import { getIOTraceRecordingState, setIOTraceRecordingEnabled } from '@proj-airi/stage-ui/composables/io-trace-recording'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ioTraceRecordingGet,
  ioTraceRecordingGetSpans,
  ioTraceRecordingRecordSpan,
  ioTraceRecordingSetEnabled,
} from '../../shared/eventa'
import { initializeIOTraceRecordingBridge } from './io-trace-recording'

function readableSpan(): ReadableSpan {
  return {
    attributes: { 'ai.moeru.airi.io.subsystem': 'llm' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    duration: [0, 2],
    ended: true,
    endTime: [0, 3],
    events: [],
    instrumentationScope: { name: 'test' },
    kind: 0,
    links: [],
    name: 'llm.stream',
    parentSpanContext: undefined,
    resource: { attributes: {} } as ReadableSpan['resource'],
    spanContext: () => ({ isRemote: false, spanId: 'span-1', traceFlags: 1, traceId: 'trace-1' }),
    startTime: [0, 1],
    status: { code: 1 },
  }
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
})

describe('iO trace recording bridge', () => {
  it('hydrates the main-owned switch and forwards local ended spans over the recording contract', async () => {
    const context = createContext<unknown, { raw?: unknown }>()
    const recorded: SerializedIOSpan[] = []
    let spanListener: ((span: ReadableSpan) => void) | undefined

    defineInvokeHandler(context, ioTraceRecordingGet, () => ({
      captureId: 'capture-1',
      capturePath: '/tmp/traces/capture-1',
      capturesDirectory: '/tmp/traces',
      enabled: true,
    }))
    defineInvokeHandler(context, ioTraceRecordingGetSpans, () => [])
    defineInvokeHandler(context, ioTraceRecordingSetEnabled, ({ enabled }) => ({
      capturesDirectory: '/tmp/traces',
      enabled,
    }))
    defineInvokeHandler(context, ioTraceRecordingRecordSpan, (span) => {
      recorded.push(span)
      return true
    })

    cleanups.push(initializeIOTraceRecordingBridge({
      context,
      forwardLocalSpans: true,
      subscribeSpan: (listener) => {
        spanListener = listener
        return () => {
          spanListener = undefined
        }
      },
    }))

    await expect.poll(() => getIOTraceRecordingState().value).toMatchObject({
      captureId: 'capture-1',
      enabled: true,
      managed: true,
    })

    spanListener?.(readableSpan())
    await expect.poll(() => recorded).toEqual([expect.objectContaining({
      ended: true,
      name: 'llm.stream',
      spanId: 'span-1',
      traceId: 'trace-1',
    })])

    await setIOTraceRecordingEnabled(false)
    expect(getIOTraceRecordingState().value).toEqual({
      capturesDirectory: '/tmp/traces',
      enabled: false,
      managed: true,
    })
  })

  it('does not attach a span forwarder in a visualization-only window', () => {
    const context = createContext<unknown, { raw?: unknown }>()
    const subscribeSpan = vi.fn()
    defineInvokeHandler(context, ioTraceRecordingGet, () => ({ capturesDirectory: '/tmp/traces', enabled: false }))
    defineInvokeHandler(context, ioTraceRecordingGetSpans, () => [])
    defineInvokeHandler(context, ioTraceRecordingSetEnabled, ({ enabled }) => ({ capturesDirectory: '/tmp/traces', enabled }))

    cleanups.push(initializeIOTraceRecordingBridge({ context, forwardLocalSpans: false, subscribeSpan }))

    expect(subscribeSpan).not.toHaveBeenCalled()
  })
})
