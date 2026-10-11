import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import { useVoiceHold, useVoiceHoldKey } from './voice-hold'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
})

function mountKey() {
  const end = vi.fn()
  const cancel = vi.fn()
  const begin = vi.fn(() => ({ end, cancel }))
  const enabled = ref(true)
  const scope = effectScope()
  scope.run(() => useVoiceHoldKey(useVoiceHold({ enabled, sessionId: () => 'alice', begin, minHoldMs: 0 })))
  cleanups.push(() => scope.stop())

  return { begin, end, cancel, enabled }
}

function key(type: 'keydown' | 'keyup', init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('useVoiceHoldKey', () => {
  it('begins on key down, ignores key repeats, and ends on key up', () => {
    const { begin, end } = mountKey()

    const down = key('keydown')
    key('keydown', { repeat: true })
    key('keyup')

    expect(down.defaultPrevented).toBe(true)
    expect(begin).toHaveBeenCalledOnce()
    expect(begin).toHaveBeenCalledWith('alice')
    expect(end).toHaveBeenCalledOnce()
  })

  it('leaves the key to text fields and controls', () => {
    const { begin } = mountKey()
    const input = document.body.appendChild(document.createElement('textarea'))
    const button = document.body.appendChild(document.createElement('button'))
    cleanups.push(() => input.remove(), () => button.remove())

    const typed = key('keydown', {}, input)
    key('keydown', {}, button)

    expect(typed.defaultPrevented).toBe(false)
    expect(begin).not.toHaveBeenCalled()
  })

  it('leaves modified keys and other keys to the browser', () => {
    const { begin } = mountKey()

    key('keydown', { ctrlKey: true })
    key('keydown', { code: 'KeyA', key: 'a' })

    expect(begin).not.toHaveBeenCalled()
  })

  it('does not take the key while the hold is disabled', () => {
    const { begin, enabled } = mountKey()
    enabled.value = false

    const down = key('keydown')

    expect(down.defaultPrevented).toBe(false)
    expect(begin).not.toHaveBeenCalled()
  })

  it('cancels the hold when the page loses focus', () => {
    const { end, cancel } = mountKey()

    key('keydown')
    window.dispatchEvent(new Event('blur'))
    key('keyup')

    expect(cancel).toHaveBeenCalledOnce()
    expect(end).not.toHaveBeenCalled()
  })
})
