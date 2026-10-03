import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'

import { useTranscriptionDraft } from './use-transcription-draft'

describe('transcription draft', () => {
  const scopes: ReturnType<typeof effectScope>[] = []

  function setup(enabledValue = true) {
    const scope = effectScope()
    scopes.push(scope)
    const draft = shallowRef('')
    const enabled = shallowRef(enabledValue)
    const delay = shallowRef(500)
    const sessionId = shallowRef('chat-1')
    const send = vi.fn()
    const controls = scope.run(() => useTranscriptionDraft({ draft, enabled, delay, send, sessionId }))!
    return { draft, enabled, delay, sessionId, send, scope, ...controls }
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    for (const scope of scopes.splice(0))
      scope.stop()
    vi.useRealTimers()
  })

  it('routes a final transcript to the draft without sending when disabled', () => {
    const state = setup(false)
    state.receive({ kind: 'final', text: 'hello', sessionId: 'chat-1' })
    vi.advanceTimersByTime(1000)
    expect(state.draft.value).toBe('hello')
    expect(state.send).not.toHaveBeenCalled()
  })

  it('sends once after the configured delay', () => {
    const state = setup()
    state.append('hello')
    vi.advanceTimersByTime(499)
    expect(state.send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(state.send).toHaveBeenCalledTimes(1)
  })

  // Report: thread://01a01e96-c814-7c63-96cd-34d14e4d1298
  // ROOT CAUSE:
  // A pending deadline sent the current draft even after manual edits.
  // Cancel synchronously when the draft changes or auto-send turns off.
  it('does not send a manually edited draft', () => {
    const state = setup()
    state.append('hello')
    state.draft.value = 'edited hello'
    vi.advanceTimersByTime(500)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('does not resurrect a deadline after disable and immediate re-enable', () => {
    const state = setup()
    state.append('hello')
    state.enabled.value = false
    state.enabled.value = true
    vi.advanceTimersByTime(500)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('cancels when the listening scope is disposed', () => {
    const state = setup()
    state.append('hello')
    state.scope.stop()
    vi.advanceTimersByTime(500)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('restarts the delay when another final transcript arrives', () => {
    const state = setup()
    state.append('hello')
    vi.advanceTimersByTime(300)
    state.append('world')
    vi.advanceTimersByTime(499)
    expect(state.send).not.toHaveBeenCalled()
    expect(state.draft.value).toBe('hello world')
    vi.advanceTimersByTime(1)
    expect(state.send).toHaveBeenCalledTimes(1)
  })

  it('keeps a cancelled draft available for manual submission', () => {
    const state = setup()
    state.append('hello')
    state.cancel()
    vi.advanceTimersByTime(500)
    expect(state.draft.value).toBe('hello')
    expect(state.send).not.toHaveBeenCalled()
  })

  it('does not schedule an empty transcript', () => {
    const state = setup()
    state.append('  ')
    vi.advanceTimersByTime(500)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('waits for the final result when new interim text arrives', () => {
    const state = setup()
    state.append('hello')
    vi.advanceTimersByTime(300)
    state.receive({ kind: 'interim', text: 'wo', sessionId: 'chat-1' })
    vi.advanceTimersByTime(500)
    expect(state.draft.value).toBe('hello wo')
    expect(state.send).not.toHaveBeenCalled()
    state.receive({ kind: 'final', text: 'world', sessionId: 'chat-1' })
    state.receive({ kind: 'clear', text: '', sessionId: 'chat-1' })
    vi.advanceTimersByTime(500)
    expect(state.draft.value).toBe('hello world')
    expect(state.send).toHaveBeenCalledTimes(1)
  })

  it('cancels on session changes and rejects late results from the previous session', () => {
    const state = setup()
    state.append('hello')
    state.sessionId.value = 'chat-2'
    state.receive({ kind: 'final', text: 'old result', sessionId: 'chat-1' })
    vi.advanceTimersByTime(500)
    expect(state.draft.value).toBe('hello')
    expect(state.send).not.toHaveBeenCalled()
  })

  it('does not auto-send again after manual submission clears the draft', () => {
    const state = setup()
    state.append('hello')
    state.draft.value = ''
    vi.advanceTimersByTime(500)
    expect(state.send).not.toHaveBeenCalled()
  })

  it('retains a final transcript followed immediately by an empty interim update', () => {
    const state = setup()
    state.receive({ kind: 'interim', text: 'hel', sessionId: 'chat-1' })
    state.receive({ kind: 'final', text: 'hello', sessionId: 'chat-1' })
    state.receive({ kind: 'interim', text: '', sessionId: 'chat-1' })
    expect(state.draft.value).toBe('hello')
    vi.advanceTimersByTime(500)
    expect(state.send).toHaveBeenCalledTimes(1)
  })

  it('cancels the previous deadline when the microphone binding stops', () => {
    const state = setup()
    state.append('hello')
    state.receive({ kind: 'stop', text: '', sessionId: 'chat-1' })
    vi.advanceTimersByTime(500)
    expect(state.draft.value).toBe('hello')
    expect(state.send).not.toHaveBeenCalled()
  })

  it('cancels the previous deadline when another recording starts', () => {
    const state = setup()
    state.append('hello')
    state.receive({ kind: 'start', text: '', sessionId: 'chat-1' })
    vi.advanceTimersByTime(500)
    expect(state.draft.value).toBe('hello')
    expect(state.send).not.toHaveBeenCalled()
  })
})
