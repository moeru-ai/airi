import type { VoiceHoldOptions } from './voice-hold'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { useVoiceHold } from './voice-hold'

const scopes: ReturnType<typeof effectScope>[] = []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.useRealTimers()
})

function createHold(options: Partial<VoiceHoldOptions> = {}) {
  const inputs: Array<{ sessionId: string, end: ReturnType<typeof vi.fn>, cancel: ReturnType<typeof vi.fn> }> = []
  const session = ref('alice')
  const enabled = ref(true)
  const scope = effectScope()
  scopes.push(scope)
  const hold = scope.run(() => useVoiceHold({
    enabled,
    sessionId: () => session.value,
    begin: (sessionId) => {
      const input = { sessionId, end: vi.fn(), cancel: vi.fn() }
      inputs.push(input)
      return input
    },
    ...options,
  }))!

  return { hold, inputs, session, enabled, scope }
}

describe('useVoiceHold', () => {
  it('begins on press and ends the same input on release', () => {
    const { hold, inputs } = createHold()

    hold.press()
    expect(hold.held.value).toBe(true)
    vi.advanceTimersByTime(1000)
    hold.release()

    expect(inputs).toHaveLength(1)
    expect(inputs[0].end).toHaveBeenCalledOnce()
    expect(inputs[0].cancel).not.toHaveBeenCalled()
    expect(hold.held.value).toBe(false)
  })

  it('ignores repeated presses while the key stays down', () => {
    const { hold, inputs } = createHold()

    hold.press()
    hold.press()
    hold.press()

    expect(inputs).toHaveLength(1)
  })

  it('cancels a tap that is shorter than the minimum hold', () => {
    const { hold, inputs } = createHold({ minHoldMs: 300 })

    hold.press()
    vi.advanceTimersByTime(299)
    hold.release()

    expect(inputs[0].cancel).toHaveBeenCalledOnce()
    expect(inputs[0].end).not.toHaveBeenCalled()
  })

  it('keeps the session that the press captured when the active session changes', () => {
    const { hold, inputs, session } = createHold()

    hold.press()
    session.value = 'bob'
    vi.advanceTimersByTime(1000)
    hold.release()

    expect(inputs).toHaveLength(1)
    expect(inputs[0].sessionId).toBe('alice')
    expect(inputs[0].end).toHaveBeenCalledOnce()
  })

  it('ignores a release without a press', () => {
    const { hold, inputs } = createHold()

    hold.release()

    expect(inputs).toHaveLength(0)
  })

  it('ignores a press while disabled or without a session', () => {
    const { hold, inputs, enabled, session } = createHold()

    enabled.value = false
    hold.press()
    enabled.value = true
    session.value = ''
    hold.press()

    expect(inputs).toHaveLength(0)
    expect(hold.held.value).toBe(false)
  })

  it('ignores a press when the host does not begin an input', () => {
    const { hold } = createHold({ begin: () => undefined })

    hold.press()

    expect(hold.held.value).toBe(false)
  })

  it('cancels the running hold when it is disabled', async () => {
    const { hold, inputs, enabled } = createHold()

    hold.press()
    enabled.value = false
    await nextTick()
    hold.release()

    expect(inputs[0].cancel).toHaveBeenCalledOnce()
    expect(inputs[0].end).not.toHaveBeenCalled()
  })

  it('cancels the running hold when its owner is disposed', () => {
    const { hold, inputs, scope } = createHold()

    hold.press()
    scope.stop()

    expect(inputs[0].cancel).toHaveBeenCalledOnce()
  })

  it('cancels on request and starts a new input on the next press', () => {
    const { hold, inputs } = createHold()

    hold.press()
    hold.cancel('Window lost focus')
    hold.press()

    expect(inputs[0].cancel).toHaveBeenCalledWith('Window lost focus')
    expect(inputs).toHaveLength(2)
  })
})
