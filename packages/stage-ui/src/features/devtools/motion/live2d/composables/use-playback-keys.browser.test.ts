import type { Mock } from 'vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { useLive2DMotionPlaybackKeys } from './use-playback-keys'

interface KeyboardCallbacks {
  goToEnd: Mock<() => void>
  goToStart: Mock<() => void>
  pause: Mock<() => void>
  play: Mock<() => void>
  stepBackward: Mock<(steps: number) => void>
  stepForward: Mock<(steps: number) => void>
}

function createKeyboardCallbacks(): KeyboardCallbacks {
  return {
    goToEnd: vi.fn<() => void>(),
    goToStart: vi.fn<() => void>(),
    pause: vi.fn<() => void>(),
    play: vi.fn<() => void>(),
    stepBackward: vi.fn<(steps: number) => void>(),
    stepForward: vi.fn<(steps: number) => void>(),
  }
}

async function renderKeyboardHarness(callbacks: KeyboardCallbacks) {
  const disabled = shallowRef(false)
  const playing = shallowRef(false)
  const Harness = defineComponent({
    setup() {
      useLive2DMotionPlaybackKeys({
        disabled: () => disabled.value,
        goToEnd: callbacks.goToEnd,
        goToStart: callbacks.goToStart,
        isPlaying: () => playing.value,
        pause: callbacks.pause,
        play: callbacks.play,
        stepBackward: callbacks.stepBackward,
        stepForward: callbacks.stepForward,
      })

      return () => h('input', { 'aria-label': 'Motion value' })
    },
  })

  const screen = await render(Harness)
  return { disabled, playing, screen }
}

async function dispatchKey(
  type: 'keydown' | 'keyup',
  key: string,
  code: string,
  modifiers: Pick<KeyboardEventInit, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> = {},
  target: EventTarget = window,
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    code,
    key,
    ...modifiers,
  })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

async function pressModifier(key: 'Alt' | 'Shift'): Promise<void> {
  await dispatchKey('keydown', key, `${key}Left`, {
    altKey: key === 'Alt',
    shiftKey: key === 'Shift',
  })
}

async function releaseModifier(key: 'Alt' | 'Shift'): Promise<void> {
  await dispatchKey('keyup', key, `${key}Left`)
}

describe('useLive2DMotionPlaybackKeys', () => {
  afterEach(() => {
    // ROOT CAUSE:
    //
    // Each harness owns window listeners. Without cleanup, earlier harnesses
    // can prevent a later test's keyboard event after that test disables shortcuts.
    cleanup()
    vi.useRealTimers()
  })

  it('maps playback and jump shortcuts to their commands', async () => {
    const callbacks = createKeyboardCallbacks()
    const { playing } = await renderKeyboardHarness(callbacks)

    await pressModifier('Shift')
    const playEvent = await dispatchKey('keydown', ' ', 'Space', { shiftKey: true })
    expect(playEvent.defaultPrevented).toBe(true)
    expect(callbacks.play).toHaveBeenCalledOnce()
    await dispatchKey('keyup', ' ', 'Space', { shiftKey: true })
    await releaseModifier('Shift')

    playing.value = true
    await pressModifier('Shift')
    await dispatchKey('keydown', ' ', 'Space', { shiftKey: true })
    expect(callbacks.pause).toHaveBeenCalledOnce()
    await dispatchKey('keyup', ' ', 'Space', { shiftKey: true })
    await releaseModifier('Shift')

    await pressModifier('Alt')
    await dispatchKey('keydown', 'a', 'KeyA', { altKey: true })
    expect(callbacks.goToStart).toHaveBeenCalledOnce()
    await dispatchKey('keyup', 'a', 'KeyA', { altKey: true })
    await dispatchKey('keydown', 'd', 'KeyD', { altKey: true })
    expect(callbacks.goToEnd).toHaveBeenCalledOnce()
    await dispatchKey('keyup', 'd', 'KeyD', { altKey: true })
    await releaseModifier('Alt')
  })

  it('moves one frame on a tap and accelerates a held seek', async () => {
    vi.useFakeTimers()
    const callbacks = createKeyboardCallbacks()
    await renderKeyboardHarness(callbacks)

    await pressModifier('Shift')
    await dispatchKey('keydown', 'a', 'KeyA', { shiftKey: true })
    await dispatchKey('keyup', 'a', 'KeyA', { shiftKey: true })
    expect(callbacks.stepBackward).toHaveBeenCalledWith(1)

    await dispatchKey('keydown', 'd', 'KeyD', { shiftKey: true })
    await vi.advanceTimersByTimeAsync(300)
    expect(callbacks.stepForward).toHaveBeenCalledTimes(1)
    const firstHeldStep = callbacks.stepForward.mock.calls[0]?.[0]
    expect(firstHeldStep).toBeGreaterThanOrEqual(5)

    await vi.advanceTimersByTimeAsync(600)
    const lastHeldStep = callbacks.stepForward.mock.calls.at(-1)?.[0]
    expect(lastHeldStep).toBeGreaterThan(firstHeldStep)

    await dispatchKey('keyup', 'd', 'KeyD', { shiftKey: true })
    const callsAfterRelease = callbacks.stepForward.mock.calls.length
    await vi.advanceTimersByTimeAsync(300)
    expect(callbacks.stepForward).toHaveBeenCalledTimes(callsAfterRelease)
    await releaseModifier('Shift')
  })

  it('leaves shortcuts available to text entry and ignores them when disabled', async () => {
    const callbacks = createKeyboardCallbacks()
    const { disabled, screen } = await renderKeyboardHarness(callbacks)
    const input = screen.getByRole('textbox')

    await input.click()
    const inputElement = document.activeElement
    expect(inputElement).toBeInstanceOf(HTMLInputElement)
    await dispatchKey('keydown', 'Shift', 'ShiftLeft', { shiftKey: true }, inputElement ?? window)
    const inputEvent = await dispatchKey('keydown', ' ', 'Space', { shiftKey: true }, inputElement ?? window)
    expect(inputEvent.defaultPrevented).toBe(false)
    expect(callbacks.play).not.toHaveBeenCalled()
    await dispatchKey('keyup', ' ', 'Space', { shiftKey: true }, inputElement ?? window)
    await dispatchKey('keyup', 'Shift', 'ShiftLeft', {}, inputElement ?? window)

    if (inputElement instanceof HTMLElement)
      inputElement.blur()
    await nextTick()
    disabled.value = true
    await nextTick()
    await pressModifier('Shift')
    const disabledEvent = await dispatchKey('keydown', ' ', 'Space', { shiftKey: true })
    expect(disabledEvent.defaultPrevented).toBe(false)
    expect(callbacks.play).not.toHaveBeenCalled()
    await dispatchKey('keyup', ' ', 'Space', { shiftKey: true })
    await releaseModifier('Shift')
  })
})
