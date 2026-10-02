import type { ReadableSpan } from '@proj-airi/stage-ui/composables/use-io-tracer'

import { createCallbackSpanExporter, subscribeIOSpan } from '@proj-airi/stage-ui/composables/use-io-tracer'
import { describe, expect, it, vi } from 'vitest'

describe('iO span subscribers', () => {
  it('delivers one ended span to the recorder and visualization without callback replacement', () => {
    const recorder = vi.fn()
    const visualization = vi.fn()
    const stopRecorder = subscribeIOSpan(recorder)
    subscribeIOSpan(visualization)
    const span = { name: 'llm.stream' } as ReadableSpan

    createCallbackSpanExporter().export([span], vi.fn())
    expect(recorder).toHaveBeenCalledWith(span)
    expect(visualization).toHaveBeenCalledWith(span)

    stopRecorder()
    createCallbackSpanExporter().export([span], vi.fn())
    expect(recorder).toHaveBeenCalledTimes(1)
    expect(visualization).toHaveBeenCalledTimes(2)
  })
})
