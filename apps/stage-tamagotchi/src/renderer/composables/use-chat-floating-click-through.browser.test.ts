import type { MaybeRefOrGetter, ShallowRef, VNode } from 'vue'

import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, shallowRef, vShow, withDirectives } from 'vue'

import { dismissOverlays, useChatFloatingClickThrough } from './use-chat-floating-click-through'

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

/** Mounts `content` under the cursor and runs the hit test once it is painted. */
async function renderPainted(content: () => VNode, pinned: MaybeRefOrGetter<boolean> = true) {
  mocks.cursor!.x.value = 40
  mocks.cursor!.y.value = 40
  let hitTest = () => {}
  const screen = await render(defineComponent({
    setup() {
      hitTest = useChatFloatingClickThrough({ pinned }).hitTest
      return content
    },
  }))
  onTestFinished(() => screen.unmount())
  hitTest()
}

const box = { position: 'fixed', left: '0', top: '0', width: '100px', height: '100px' }

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

  it('takes the pointer over text inside a painted bubble', async () => {
    // Text has no background of its own. Judging only the element under the
    // cursor would pass a click on a message's words through to the desktop.
    await renderPainted(() => h('div', { style: { ...box, background: 'white' } }, [
      h('span', { style: { display: 'block', width: '100%', height: '100%' } }, 'message'),
    ]))

    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }]))
  })

  it('takes the pointer over a gradient background', async () => {
    await renderPainted(() => h('div', { style: { ...box, backgroundImage: 'linear-gradient(white, white)' } }))

    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }]))
  })

  it('lets clicks through content that is faded out', async () => {
    await renderPainted(() => h('div', { style: { opacity: '0' } }, [h('div', { style: { ...box, background: 'white' } })]))

    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([true, { forward: true }]))
  })

  it('takes the pointer at once while the chat is not pinned', async () => {
    // Clicks passing through an unpinned window would sink it behind the app
    // that receives them. The pin choice applies without a cursor move.
    const pinned = shallowRef(true)
    await renderPainted(() => h('div'), pinned)
    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([true, { forward: true }]))

    pinned.value = false
    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }]))
  })

  it('lets clicks through again once a held pointer is released', async () => {
    const { shown, hitTest } = await renderPage()
    shown.value = true
    await nextTick()
    hitTest()
    // The pressed content goes away while the hand stays still.
    shown.value = false
    await nextTick()

    window.dispatchEvent(new PointerEvent('pointerdown'))
    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }]))

    window.dispatchEvent(new PointerEvent('pointerup'))
    await vi.waitFor(() => expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([true, { forward: true }]))
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

    // Coming back near the old spot, where nothing is painted now, stays click-through.
    mocks.cursor!.x.value = 44
    await nextTick()
    expect(mocks.setIgnoreMouseEvents).toHaveBeenLastCalledWith([true, { forward: true }])
  })

  it('closes an open menu when the chat hides', async () => {
    // ROOT CAUSE:
    //
    // A menu closes only on events inside its page. The fold click happens in
    // the main window, so the menu stayed open through the fold.
    //
    // The floating page now closes its menus and dialogs as the content hides.
    const screen = await render(defineComponent({
      setup: () => () => h(DropdownMenuRoot, { defaultOpen: true }, () => [
        h(DropdownMenuTrigger, () => 'Style'),
        h(DropdownMenuPortal, () => h(DropdownMenuContent, () => h(DropdownMenuItem, () => 'Classic window'))),
      ]),
    }))
    onTestFinished(() => screen.unmount())
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())

    await dismissOverlays()

    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
  })
})
