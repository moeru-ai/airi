import type { ShallowRef } from 'vue'

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, shallowRef, vShow, withDirectives } from 'vue'

import { useChatFloatingClickThrough } from './use-chat-floating-click-through'

const mocks = vi.hoisted(() => ({
  setIgnoreMouseEvents: vi.fn(),
  /** The cursor, which the doubles report the same on the screen and in the window. */
  cursor: undefined as { x: ShallowRef<number>, y: ShallowRef<number> } | undefined,
}))

// NOTICE:
// The cursor position and the click-through switch come from the Electron main
// process. The doubles hold the cursor still over the top-left corner and
// record what the composable asks the window to do.
// Removal condition: browser tests running inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', async () => {
  const { shallowRef } = await import('vue')
  mocks.cursor = { x: shallowRef(40), y: shallowRef(40) }
  return {
    useElectronMouse: () => mocks.cursor,
    useElectronRelativeMouse: () => mocks.cursor,
    useElectronEventaInvoke: () => mocks.setIgnoreMouseEvents,
  }
})

/** Mounts a transparent page with a 100px white box under the cursor, hidden until `shown`. */
async function renderPage() {
  mocks.cursor!.x.value = 40
  mocks.cursor!.y.value = 40
  const shown = shallowRef(false)
  let hitTest = () => {}
  const screen = await render(defineComponent({
    setup() {
      hitTest = useChatFloatingClickThrough({ pinned: true }).hitTest
      return () => withDirectives(h('div', {
        style: { position: 'fixed', left: '0', top: '0', width: '100px', height: '100px', background: 'white' },
      }), [[vShow, shown.value]])
    },
  }))
  onTestFinished(() => screen.unmount())
  await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([true, { forward: true }]))
  return { shown, hitTest: () => hitTest() }
}

describe('useChatFloatingClickThrough', () => {
  it('takes the pointer when a menu opens under a cursor that does not move', async () => {
    // ROOT CAUSE:
    //
    // Only a cursor move ran the hit test again. A menu that opened under a
    // still cursor left the window click-through, so a click to close it went
    // to the app below.
    //
    // A dialog or menu that mounts into the body now runs the hit test again.
    await renderPage()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    onTestFinished(() => menu.remove())

    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }]))
  })

  it('takes the pointer when the page asks again after content appeared under the cursor', async () => {
    const { shown, hitTest } = await renderPage()

    // The page asks once the unfold has finished, when the content is painted.
    shown.value = true
    await nextTick()
    hitTest()

    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }]))
  })

  it('keeps the pointer while a still hand scrolls a gap under the cursor', async () => {
    // ROOT CAUSE:
    //
    // When a scroll or a shaking hand put the gap between two bubbles under
    // the cursor, the window turned click-through, and the rest of the wheel
    // gesture scrolled the app below.
    //
    // The window now lets go only after the hand presses or really moves.
    const { shown, hitTest } = await renderPage()
    shown.value = true
    await nextTick()
    hitTest()
    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }]))

    // The content scrolls away, and the hand shakes within the jitter.
    shown.value = false
    await nextTick()
    mocks.cursor!.x.value = 46
    await nextTick()
    expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }])

    mocks.cursor!.x.value = 60
    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([true, { forward: true }]))
  })
})
