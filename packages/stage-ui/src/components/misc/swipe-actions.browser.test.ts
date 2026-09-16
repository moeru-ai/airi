import type { SwipeActionsSide } from '@proj-airi/ui'

import { SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'

function createHarness(dir: 'ltr' | 'rtl' = 'ltr') {
  const open = ref(false)
  const side = ref<SwipeActionsSide>('end')
  const selected = ref('none')
  const showStart = ref(true)
  const component = defineComponent({
    components: { SwipeActionsRoot, SwipeActionsContent, SwipeActionsList, SwipeActionsItem },
    setup: () => ({ open, side, selected, showStart, dir }),
    template: `
      <SwipeActionsRoot v-model:open="open" v-model:side="side" :dir="dir"
        style="width: 400px; height: 80px" @action="(value, edge) => selected = edge + ':' + value">
        <SwipeActionsContent>Conversation</SwipeActionsContent>
        <SwipeActionsList v-if="showStart" side="start" :action-width="64">
          <SwipeActionsItem value="archive">Start archive</SwipeActionsItem>
          <SwipeActionsItem value="pin">Pin</SwipeActionsItem>
        </SwipeActionsList>
        <SwipeActionsList side="end" default-action="archive" :action-width="72">
          <SwipeActionsItem value="delete">Delete</SwipeActionsItem>
          <SwipeActionsItem value="archive">End archive</SwipeActionsItem>
          <SwipeActionsItem value="more">More</SwipeActionsItem>
        </SwipeActionsList>
      </SwipeActionsRoot>
    `,
  })
  return { component, open, side, selected, showStart }
}

function wheel(row: HTMLElement, deltaX: number) {
  row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
}

function contentOffset(row: HTMLElement) {
  const content = row.querySelector<HTMLElement>('[data-swipe-actions-content]')!
  return new DOMMatrixReadOnly(getComputedStyle(content).transform).m41
}

describe('bidirectional swipe actions', () => {
  // https://github.com/moeru-ai/airi/pull/2536#discussion_r3999184712
  it('keeps vertical scrolling native after a small horizontal wheel jitter', async () => {
    // ROOT CAUSE:
    // The first wheel sample locked the whole sequence. A tiny horizontal
    // sample then prevented subsequent vertical scrolling until the idle timer.
    const state = createHarness()
    const screen = await render(state.component)
    const row = screen.container.querySelector<HTMLElement>('[data-swipe-actions]')!
    const jitter = new WheelEvent('wheel', { deltaX: 1, deltaY: 0, bubbles: true, cancelable: true })
    const vertical = new WheelEvent('wheel', { deltaX: 0, deltaY: 40, bubbles: true, cancelable: true })
    row.dispatchEvent(jitter)
    row.dispatchEvent(vertical)
    expect(jitter.defaultPrevented).toBe(false)
    expect(vertical.defaultPrevented).toBe(false)
    expect(contentOffset(row)).toBe(0)
    expect(state.open.value).toBe(false)
  })

  it('crosses zero into the other List and keeps each layout independent', async () => {
    const state = createHarness()
    const screen = await render(state.component)
    const row = screen.container.querySelector<HTMLElement>('[data-swipe-actions]')!
    await expect.poll(() => row.querySelectorAll('[data-swipe-actions-item]').length).toBe(5)
    wheel(row, -110)
    await expect.poll(() => state.side.value).toBe('start')
    await expect.poll(() => contentOffset(row)).toBe(110)
    const start = row.querySelector<HTMLElement>('[data-swipe-actions-list][data-side="start"]')!
    const end = row.querySelector<HTMLElement>('[data-swipe-actions-list][data-side="end"]')!
    expect(start.getBoundingClientRect().left).toBe(row.getBoundingClientRect().left)
    expect(end.getBoundingClientRect().width).toBe(0)
    wheel(row, 290)
    await expect.poll(() => state.side.value).toBe('end')
    await expect.poll(() => contentOffset(row)).toBe(-180)
    expect(start.getBoundingClientRect().width).toBe(0)
    expect(end.getBoundingClientRect().right).toBe(row.getBoundingClientRect().right)
    await expect.poll(() => contentOffset(row)).toBe(-216)
    expect(state.selected.value).toBe('none')
  })

  it('commits each List default with its side and mirrors the takeover layout', async () => {
    const state = createHarness()
    const screen = await render(state.component)
    const row = screen.container.querySelector<HTMLElement>('[data-swipe-actions]')!
    await expect.poll(() => row.querySelectorAll('[data-swipe-actions-item]').length).toBe(5)
    wheel(row, -340)
    await expect.poll(() => state.selected.value).toBe('start:pin')
    const start = row.querySelector('[data-swipe-actions-list][data-side="start"]')!
    const pin = start.querySelector<HTMLElement>('[data-value="pin"]')!
    const previous = start.querySelector<HTMLElement>('[data-value="archive"]')!
    expect(pin.getBoundingClientRect().width).toBeGreaterThan(380)
    expect(previous.getBoundingClientRect().left).toBeGreaterThanOrEqual(row.getBoundingClientRect().right)
    await expect.poll(() => row.hasAttribute('inert')).toBe(false)
    await expect.poll(() => contentOffset(row)).toBe(0)
    wheel(row, 340)
    await expect.poll(() => state.selected.value).toBe('end:archive')
  })

  it('accepts controlled side changes while keeping focus outside the hidden List', async () => {
    const state = createHarness()
    const screen = await render(state.component)
    const row = screen.container.querySelector<HTMLElement>('[data-swipe-actions]')!
    state.side.value = 'start'
    state.open.value = true
    const pin = screen.getByRole('button', { name: 'Pin', exact: true })
    await expect.element(pin).toBeVisible()
    await expect.poll(() => contentOffset(row)).toBe(128)
    pin.element().focus()
    state.side.value = 'end'
    await expect.poll(() => contentOffset(row)).toBe(-216)
    expect(state.open.value).toBe(true)
    expect(document.activeElement).toBe(row.querySelector('[data-swipe-actions-content]'))
    await screen.getByRole('button', { name: 'End archive' }).click()
    expect(state.selected.value).toBe('end:archive')
    await expect.poll(() => state.open.value).toBe(false)
  })

  it('maps logical edges in RTL and cancels an action when its List is removed', async () => {
    const state = createHarness('rtl')
    const screen = await render(state.component)
    const row = screen.container.querySelector<HTMLElement>('[data-swipe-actions]')!
    await expect.poll(() => row.querySelectorAll('[data-swipe-actions-item]').length).toBe(5)
    wheel(row, 100)
    await expect.poll(() => state.side.value).toBe('start')
    await expect.poll(() => contentOffset(row)).toBe(-100)
    wheel(row, 230)
    state.showStart.value = false
    await expect.poll(() => row.querySelectorAll('[data-swipe-actions-item]').length).toBe(3)
    await expect.poll(() => contentOffset(row)).toBe(0)
    expect(state.selected.value).toBe('none')
    wheel(row, -340)
    await expect.poll(() => state.selected.value).toBe('end:archive')
  })
})
