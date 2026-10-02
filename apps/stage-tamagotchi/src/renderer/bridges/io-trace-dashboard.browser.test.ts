import type { IOTraceRecordingState, SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { configureIOTraceRecordingController } from '@proj-airi/stage-ui/composables/io-trace-recording'
import { useIOTracerStore } from '@proj-airi/stage-ui/stores/devtools/io-tracer'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

function recordedSpan(): SerializedIOSpan {
  return {
    attributes: { 'ai.moeru.airi.io.subsystem': 'llm' },
    ended: true,
    endTimeNano: '3000000',
    events: [],
    kind: 0,
    name: 'llm.stream',
    parentSpanId: '',
    spanId: 'span-1',
    startTimeNano: '1000000',
    status: { code: 1, message: '' },
    traceId: 'trace-1',
  }
}

afterEach(async () => {
  await configureIOTraceRecordingController(undefined)
})

describe('iO trace dashboard', () => {
  it('hydrates the active capture and closing the dashboard does not stop global recording', async () => {
    setActivePinia(createPinia())
    const state: IOTraceRecordingState = { capturesDirectory: '/tmp/traces', enabled: true }
    const setEnabled = vi.fn(async (enabled: boolean) => ({ ...state, enabled }))
    await configureIOTraceRecordingController({
      getSpans: async () => [recordedSpan()],
      getState: async () => state,
      onStateChange: () => () => {},
      setEnabled,
    })

    const store = useIOTracerStore()
    await store.mountVisualization()
    expect(store.isRecording).toBe(true)
    expect(store.rawSpanCount).toBe(1)

    store.unmountVisualization()
    expect(setEnabled).not.toHaveBeenCalled()
    expect(store.isRecording).toBe(true)
  })
})
