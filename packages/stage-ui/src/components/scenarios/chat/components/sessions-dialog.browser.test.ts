import type { ChatSessionMeta } from '../../../../types/chat-session'

import { SwipeActionButton, SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import SessionsDialog from './sessions-dialog.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        stage: {
          chat: {
            sessions: {
              'title': 'Chats',
              'new': 'New chat',
              'empty': 'No chats',
              'delete': 'Delete conversation',
              'delete-short': 'Delete',
              'current': 'Current',
              'cancel': 'Cancel',
              'confirm-delete': 'Delete this conversation and its messages?',
              'cloud-badge': 'Cloud synced',
            },
          },
        },
      },
    },
  })
}

function sessionMeta(sessionId: string, updatedAt: number): ChatSessionMeta {
  return {
    sessionId,
    characterId: 'default',
    userId: 'local',
    createdAt: updatedAt,
    updatedAt,
  }
}

function createHarness(rows = [
  { meta: sessionMeta('session-one', 2), preview: 'First chat', isActive: true, updatedAtLabel: 'now' },
  { meta: sessionMeta('session-two', 1), preview: 'Second chat', isActive: false, updatedAtLabel: 'yesterday' },
], isDesktop = false) {
  return defineComponent({
    name: 'SessionsDialogHarness',
    components: { SessionsDialog },
    setup() {
      const created = ref(0)
      const selected = ref('none')
      const deleted = ref('none')
      const deleteCount = ref(0)

      return {
        created,
        deleted,
        deleteCount,
        selected,
        rows,
        isDesktop,
      }
    },
    template: `
      <SessionsDialog
        :open="true"
        :rows="rows"
        :is-desktop="isDesktop"
        :is-creating-session="false"
        @new-session="created += 1"
        @select-session="selected = $event"
        @delete-session="deleted = $event; deleteCount += 1"
      />
      <output aria-label="created-session-count">{{ created }}</output>
      <output aria-label="selected-session-id">{{ selected }}</output>
      <output aria-label="deleted-session-id">{{ deleted }}</output>
      <output aria-label="delete-count">{{ deleteCount }}</output>
    `,
  })
}

describe('sessions dialog actions', () => {
  // https://github.com/moeru-ai/airi/pull/2536#discussion_r3999100810
  it('restores focus to visible content after selecting a retained action', async () => {
    // ROOT CAUSE:
    // Closing made the List inert while its selected action still held focus.
    // Restore focus before hiding the List, including controlled closes.
    const open = ref(true)
    const screen = await render(defineComponent({
      components: { SwipeActionsRoot, SwipeActionsContent, SwipeActionsList, SwipeActionsItem },
      setup: () => ({ open }),
      template: `
        <SwipeActionsRoot v-model:open="open" style="width: 350px; height: 80px">
          <SwipeActionsContent>Content</SwipeActionsContent>
          <SwipeActionsList><SwipeActionsItem value="pin">Pin</SwipeActionsItem></SwipeActionsList>
        </SwipeActionsRoot>
      `,
    }))
    const pin = screen.getByRole('button', { name: 'Pin', exact: true })
    await expect.element(pin).toBeVisible()
    const row = pin.element().closest<HTMLElement>('[data-swipe-actions]')!
    const content = row.querySelector<HTMLElement>('[data-swipe-actions-content]')!
    expect(getComputedStyle(row).touchAction).toBe('pan-y')
    await pin.click()
    await expect.poll(() => open.value).toBe(false)
    expect(document.activeElement).toBe(content)
    open.value = true
    await expect.element(pin).toBeVisible()
    pin.element().focus()
    open.value = false
    await expect.poll(() => document.activeElement).toBe(content)
  })

  it('fills the label area when labels are hidden and keeps the accessible name', async () => {
    const screen = await render(defineComponent({
      components: { SwipeActionButton },
      setup: () => ({ showLabel: ref(true) }),
      template: `
        <button @click="showLabel = !showLabel">Toggle label</button>
        <div style="height: 80px; width: 72px">
          <SwipeActionButton label="Archive" icon="i-solar:archive-outline" :show-label="showLabel" />
        </div>
      `,
    }))
    const action = screen.getByRole('button', { name: 'Archive', exact: true }).element()
    const surface = action.querySelector('[data-swipe-action-surface]')!
    expect(surface.getBoundingClientRect().height).toBe(44)
    await screen.getByRole('button', { name: 'Toggle label' }).click()
    expect(action.querySelector('[data-swipe-action-label]')).toBeNull()
    expect(surface.getBoundingClientRect().height).toBe(64)
    expect(screen.getByRole('button', { name: 'Archive', exact: true }).element()).toBe(action)
    const icon = action.querySelector('[data-swipe-action-icon]')!.getBoundingClientRect()
    expect(icon.y + icon.height / 2).toBe(surface.getBoundingClientRect().y + surface.getBoundingClientRect().height / 2)
  })

  it('reserves the configured gap beside content while the first action enters', async () => {
    // ROOT CAUSE:
    // The scale cap used the full revealed width and left no space beside Content.
    // Reserve the configured gap before scaling, including during partial reveal.
    const screen = await render(defineComponent({
      components: { SwipeActionsRoot, SwipeActionsContent, SwipeActionsList, SwipeActionsItem },
      template: `
        <SwipeActionsRoot style="width: 350px; height: 80px">
          <SwipeActionsContent><button style="height: 80px">Conversation</button></SwipeActionsContent>
          <SwipeActionsList :action-width="72" :gap="16">
            <SwipeActionsItem value="pin">Pin</SwipeActionsItem>
          </SwipeActionsList>
        </SwipeActionsRoot>
      `,
    }))
    const row = screen.getByRole('button', { name: 'Conversation', exact: true }).element().closest('[data-swipe-actions]')!
    const action = row.querySelector('[data-swipe-actions-item]')!
    const content = row.querySelector('[data-swipe-actions-content]')!
    const wheel = (deltaX: number) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
    const hold = setInterval(wheel, 40, 0)
    try {
      wheel(36)
      await expect.poll(() => action.getBoundingClientRect().width).toBeGreaterThan(0)
      expect(action.getBoundingClientRect().left - content.getBoundingClientRect().right).toBeCloseTo(8, 1)
      wheel(36)
      await expect.poll(() => action.getBoundingClientRect().width).toBeCloseTo(56, 1)
      expect(action.getBoundingClientRect().left - content.getBoundingClientRect().right).toBeCloseTo(8, 1)
    }
    finally {
      clearInterval(hold)
    }
  })

  it('reveals each action only when its container has space and reverses the same curve', async () => {
    // ROOT CAUSE:
    // Closing reduced each action's width while retaining its full height.
    // Keep the aspect ratio and ease the whole item with distance, so reversing
    // at the same reveal restores the same appearance without a timed animation.
    const screen = await render(defineComponent({
      components: { SwipeActionsRoot, SwipeActionsContent, SwipeActionsList, SwipeActionsItem, SwipeActionButton },
      template: `
        <SwipeActionsRoot style="width: 350px; height: 80px">
          <SwipeActionsContent><button style="height: 80px">Conversation</button></SwipeActionsContent>
          <SwipeActionsList :action-width="72">
            <SwipeActionsItem v-for="action in ['Delete', 'Archive', 'Pin']" :key="action" :value="action" as-child>
              <SwipeActionButton :label="action" icon="i-solar:pin-outline" />
            </SwipeActionsItem>
          </SwipeActionsList>
        </SwipeActionsRoot>
      `,
    }))
    const row = screen.getByRole('button', { name: 'Conversation', exact: true }).element().closest('[data-swipe-actions]')!
    const actions = [...row.querySelectorAll('[data-swipe-actions-list] button')]
    const bounds = () => actions.map(action => action.querySelector('[data-swipe-action-surface]')!.getBoundingClientRect())
    const wheel = (deltaX: number) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
    const hold = setInterval(wheel, 40, 0)
    try {
      wheel(216)
      await expect.poll(() => bounds()[0].width).toBeCloseTo(64, 0)
      const expanded = bounds()
      wheel(-108)
      await expect.poll(() => bounds()[0].width).toBeLessThan(expanded[0].width)
      expect(getComputedStyle(row.querySelector('[data-swipe-actions-list]')!).containerType).toBe('inline-size')
      expect(bounds()[0].width).toBe(0)
      expect(actions[0].hasAttribute('inert')).toBe(true)
      expect(actions[0].getAttribute('tabindex')).toBe('-1')
      expect(bounds()[2].width).toBeCloseTo(expanded[2].width, 2)
      const half = bounds()[1].width / expanded[1].width
      const halfOpacity = Number(getComputedStyle(actions[1]).opacity)
      expect(half).toBeCloseTo(28 / 64, 2)
      expect(halfOpacity).toBeGreaterThan(0.5)
      expect(bounds()[1].width / bounds()[1].height).toBeCloseTo(expanded[1].width / expanded[1].height, 2)
      expect(actions[1].getBoundingClientRect().right).toBeLessThan(actions[2].getBoundingClientRect().left)
      wheel(-18)
      await expect.poll(() => bounds()[1].width / expanded[1].width).toBeLessThan(half)
      const quarterOpacity = Number(getComputedStyle(actions[1]).opacity)
      expect(quarterOpacity).toBeGreaterThan(halfOpacity - quarterOpacity)
      expect(bounds()[0].width).toBe(0)
      wheel(18)
      await expect.poll(() => bounds()[1].width / expanded[1].width).toBeCloseTo(half, 3)
      expect(Number(getComputedStyle(actions[1]).opacity)).toBeCloseTo(halfOpacity, 3)
    }
    finally {
      clearInterval(hold)
    }
  })

  it('preserves gaps, pushes earlier actions behind content, and invokes the last action after reordering', async () => {
    await page.viewport(390, 844)
    const screen = await render(defineComponent({
      components: { SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot },
      setup() {
        return { actions: ref(['delete', 'archive', 'pin']), invoked: ref('none') }
      },
      template: `
        <button @click="actions = ['pin', 'delete', 'archive']">Reorder</button>
        <SwipeActionsRoot style="width: 350px; height: 80px" @action="invoked = $event">
          <SwipeActionsList :action-width="72">
            <SwipeActionsItem v-for="action in actions" :key="action" :value="action" :data-action="action">{{ action }}</SwipeActionsItem>
          </SwipeActionsList>
          <SwipeActionsContent><button style="height: 80px">Conversation</button></SwipeActionsContent>
        </SwipeActionsRoot>
        <output aria-label="invoked-action">{{ invoked }}</output>
      `,
    }))
    const row = screen.getByRole('button', { name: 'Conversation', exact: true }).element().closest('[data-swipe-actions]')!
    const strip = row.querySelector('[data-swipe-actions-list]')!
    const wheel = (deltaX: number) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
    const bounds = (id: string) => strip.querySelector(`[data-action="${id}"]`)!.getBoundingClientRect()
    const hold = setInterval(wheel, 40, 0)
    try {
      wheel(90)
      await expect.poll(() => bounds('pin').width).toBeGreaterThan(15)
      expect(bounds('pin').left - bounds('archive').right).toBeCloseTo(8, 1)
      wheel(54)
      await expect.poll(() => bounds('pin').left - bounds('archive').right).toBeCloseTo(8, 1)
      wheel(116)
      await expect.poll(() => bounds('pin').width).toBeGreaterThan(340)
      expect(bounds('archive').right).toBeLessThanOrEqual(strip.getBoundingClientRect().left)
      expect(bounds('delete').right).toBeLessThanOrEqual(strip.getBoundingClientRect().left)
      expect(screen.getByLabelText('invoked-action').element().textContent).toBe('none')
      wheel(-120)
      await expect.poll(() => row.getAttribute('data-armed')).toBe('false')
      await expect.poll(() => bounds('pin').width).toBeLessThan(80)
      await expect.poll(() => bounds('archive').left - bounds('delete').right).toBeGreaterThan(0)
      expect(bounds('pin').right).toBeLessThanOrEqual(strip.getBoundingClientRect().right)
    }
    finally {
      clearInterval(hold)
    }
    await expect.poll(() => row.getAttribute('data-state')).toBe('open')
    await expect.poll(() => strip.getBoundingClientRect().width).toBeCloseTo(216, 0)
    wheel(100)
    await expect.poll(() => screen.getByLabelText('invoked-action').element().textContent).toBe('pin')
    await screen.getByRole('button', { name: 'Reorder' }).click()
    const reordered = screen.getByRole('button', { name: 'Conversation', exact: true }).element().closest('[data-swipe-actions]')!
    reordered.dispatchEvent(new WheelEvent('wheel', { deltaX: 270, bubbles: true, cancelable: true }))
    await expect.poll(() => screen.getByLabelText('invoked-action').element().textContent).toBe('archive')
  })

  it('selects stable values through as-child and lets Item selection cancel the Root action', async () => {
    const cancel = ref(true)
    const selected = ref('none')
    const screen = await render(defineComponent({
      components: { SwipeActionsRoot, SwipeActionsList, SwipeActionsItem, SwipeActionsContent, SwipeActionButton },
      setup: () => ({ cancel, selected }),
      template: `
        <SwipeActionsRoot :open="true" style="width: 350px; height: 80px" @action="selected = $event">
          <SwipeActionsList>
            <SwipeActionsItem value="pin" as-child @select="cancel && $event.preventDefault()">
              <SwipeActionButton label="Pin" icon="i-solar:pin-outline" />
            </SwipeActionsItem>
            <SwipeActionsItem value="delete" disabled>Delete</SwipeActionsItem>
          </SwipeActionsList>
          <SwipeActionsContent><span style="display: block; height: 80px">Content</span></SwipeActionsContent>
        </SwipeActionsRoot>
      `,
    }))
    const pin = screen.getByRole('button', { name: 'Pin', exact: true })
    await expect.element(pin).toBeVisible()
    expect(pin.element().querySelector('button')).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete', exact: true }).element().hasAttribute('disabled')).toBe(true)
    await pin.click()
    expect(selected.value).toBe('none')
    cancel.value = false
    await pin.click()
    expect(selected.value).toBe('pin')
  })

  it('expands an explicit middle default and does not substitute for a disabled default', async () => {
    const disabled = ref(false)
    const selected = ref('none')
    const screen = await render(defineComponent({
      components: { SwipeActionsRoot, SwipeActionsList, SwipeActionsItem, SwipeActionsContent },
      setup: () => ({ disabled, selected }),
      template: `
        <SwipeActionsRoot style="width: 350px; height: 80px" @action="selected = $event">
          <SwipeActionsList default-action="archive" :action-width="72">
            <SwipeActionsItem value="delete">Delete</SwipeActionsItem>
            <SwipeActionsItem value="archive" :disabled="disabled">Archive</SwipeActionsItem>
            <SwipeActionsItem value="pin">Pin</SwipeActionsItem>
          </SwipeActionsList>
          <SwipeActionsContent><button>Content</button></SwipeActionsContent>
        </SwipeActionsRoot>
      `,
    }))
    const row = screen.getByRole('button', { name: 'Content' }).element().closest('[data-swipe-actions]')!
    const wheel = (deltaX: number) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
    const hold = setInterval(wheel, 40, 0)
    try {
      wheel(270)
      await expect.poll(() => row.querySelector('[data-value="archive"]')!.getBoundingClientRect().width).toBeGreaterThan(340)
      const strip = row.querySelector('[data-swipe-actions-list]')!.getBoundingClientRect()
      expect(row.querySelector('[data-value="delete"]')!.getBoundingClientRect().right).toBeLessThanOrEqual(strip.left)
      expect(row.querySelector('[data-value="pin"]')!.getBoundingClientRect().left).toBeGreaterThanOrEqual(strip.right)
    }
    finally {
      clearInterval(hold)
    }
    await expect.poll(() => selected.value).toBe('archive')
    await expect.poll(() => row.getAttribute('data-committing')).toBe('false')
    disabled.value = true
    await expect.poll(() => row.querySelector('[data-value="archive"]')!.hasAttribute('disabled')).toBe(true)
    selected.value = 'none'
    wheel(270)
    await expect.poll(() => row.getAttribute('data-state')).toBe('open')
    expect(row.getAttribute('data-armed')).toBe('false')
    expect(selected.value).toBe('none')
  })

  it('cancels pending selection when Items are reordered or removed during a gesture', async () => {
    const actions = ref(['delete', 'archive', 'pin'])
    const selected = ref('none')
    const screen = await render(defineComponent({
      components: { SwipeActionsRoot, SwipeActionsList, SwipeActionsItem, SwipeActionsContent },
      setup: () => ({ actions, selected }),
      template: `
        <SwipeActionsRoot style="width: 350px; height: 80px" @action="selected = $event">
          <SwipeActionsList :action-width="72"><SwipeActionsItem v-for="action in actions" :key="action" :value="action">{{ action }}</SwipeActionsItem></SwipeActionsList>
          <SwipeActionsContent><button>Content</button></SwipeActionsContent>
        </SwipeActionsRoot>
      `,
    }))
    const row = screen.getByRole('button', { name: 'Content' }).element().closest('[data-swipe-actions]')!
    const wheel = (deltaX: number) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
    wheel(270)
    await expect.poll(() => row.getAttribute('data-armed')).toBe('true')
    actions.value = ['pin', 'archive', 'delete']
    await expect.poll(() => row.getAttribute('data-armed')).toBe('false')
    await expect.poll(() => row.querySelector('[data-swipe-actions-list]')!.getBoundingClientRect().width).toBe(0)
    expect(selected.value).toBe('none')
    wheel(270)
    await expect.poll(() => row.getAttribute('data-armed')).toBe('true')
    actions.value = ['pin', 'archive']
    await expect.poll(() => row.querySelector('[data-swipe-actions-list]')!.getBoundingClientRect().width).toBe(0)
    expect(selected.value).toBe('none')
  })

  it('fills the row before deletion and reverses the icon and label when pulled back', async () => {
    // ROOT CAUSE:
    // The armed state only changed a label. The primary action was emitted on
    // release, so the row collapsed before its full-width phase could finish.
    await page.viewport(390, 844)
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    const row = screen.getByRole('button', { name: /^Second chat/ }).element().closest('[data-swipe-actions]')!
    const actions = row.querySelector('[data-swipe-actions-list]')!
    const wheel = (deltaX: number) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
    // Keep the wheel sequence alive while observing its held shape.
    const hold = setInterval(wheel, 40, 0)
    try {
      wheel(260)
      await expect.poll(() => actions.getBoundingClientRect().width).toBeCloseTo(row.getBoundingClientRect().width, 0)
      expect(screen.getByLabelText('deleted-session-id').element().textContent).toBe('none')
      const icon = actions.querySelector('[data-swipe-action-icon]')!
      const label = actions.querySelector('[data-swipe-action-label]')!
      await expect.poll(() => icon.getBoundingClientRect().left - actions.getBoundingClientRect().left).toBeLessThan(32)
      await expect.poll(() => Number(getComputedStyle(label).opacity)).toBe(0)
      wheel(-160)
      await expect.poll(() => row.getAttribute('data-armed')).toBe('false')
      await expect.poll(() => actions.getBoundingClientRect().width).toBeLessThan(130)
      await expect.poll(() => Number(getComputedStyle(label).opacity)).toBe(1)
      await expect.poll(() => {
        const bounds = actions.getBoundingClientRect()
        const iconBounds = icon.getBoundingClientRect()
        return Math.abs(iconBounds.left + iconBounds.width / 2 - bounds.left - bounds.width / 2)
      }).toBeLessThan(2)
    }
    finally {
      clearInterval(hold)
    }
    await expect.poll(() => row.getAttribute('data-state')).toBe('open')
    expect(screen.getByLabelText('deleted-session-id').element().textContent).toBe('none')
    wheel(220)
    await expect.poll(() => screen.getByLabelText('deleted-session-id').element().textContent).toBe('session-two')
    expect(actions.getBoundingClientRect().width).toBeCloseTo(row.getBoundingClientRect().width, 0)
    expect(screen.getByLabelText('delete-count').element().textContent).toBe('1')
  })

  it('can disable full swipe while keeping ordinary actions available', async () => {
    const screen = await render(defineComponent({
      components: { SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot },
      setup: () => ({ calls: ref(0) }),
      template: '<SwipeActionsRoot style="width: 320px; height: 80px" :full-swipe="false" @action="calls += 1"><SwipeActionsList><SwipeActionsItem value="delete">Delete</SwipeActionsItem></SwipeActionsList><SwipeActionsContent><button>Row</button></SwipeActionsContent></SwipeActionsRoot><output aria-label="commit-count">{{ calls }}</output>',
    }))
    const row = screen.getByRole('button', { name: 'Row' }).element().closest('[data-swipe-actions]')!
    row.dispatchEvent(new WheelEvent('wheel', { deltaX: 300, bubbles: true, cancelable: true }))
    await expect.poll(() => row.getAttribute('data-state')).toBe('open')
    expect(row.getAttribute('data-armed')).toBe('false')
    expect(screen.getByLabelText('commit-count').element().textContent).toBe('0')
  })

  it('deletes on full-swipe release and lets a reversal cancel the armed action', async () => {
    // ROOT CAUSE:
    // Stretching only changed the revealed width. Release always snapped open,
    // so dragging all the way left could never invoke the deletion action.
    await page.viewport(390, 844)
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    const row = screen.getByRole('button', { name: /^Second chat/ }).element().closest('[data-swipe-actions]')!
    const wheel = (deltaX: number) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
    wheel(260)
    await expect.poll(() => row.getAttribute('data-armed')).toBe('true')
    expect(screen.getByLabelText('deleted-session-id').element().textContent).toBe('none')
    wheel(-160)
    await expect.poll(() => row.getAttribute('data-armed')).toBe('false')
    await expect.poll(() => row.getAttribute('data-state')).toBe('open')
    expect(screen.getByLabelText('deleted-session-id').element().textContent).toBe('none')
    wheel(220)
    await expect.poll(() => screen.getByLabelText('deleted-session-id').element().textContent).toBe('session-two')
    expect(screen.getByLabelText('selected-session-id').element().textContent).toBe('none')
    await expect.poll(() => row.getAttribute('data-state')).toBe('closed')
    expect(screen.getByLabelText('delete-count').element().textContent).toBe('1')
  })

  it('accumulates horizontal wheel intent and stretches the action area without resizing the drawer', async () => {
    // ROOT CAUSE:
    // The first prototype ignored trackpad input and clamped pointer travel to
    // 88px. The action surface must follow input beyond its settled width.
    await page.viewport(390, 844)
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    const row = screen.getByRole('button', { name: /^Second chat/ }).element().closest('[data-swipe-actions]')!
    const actions = row.querySelector('[data-swipe-actions-list]')!
    const height = row.getBoundingClientRect().height
    const wheel = (deltaX: number, deltaY = 0) => row.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true }))
    wheel(3)
    // Small wheel samples remain native until the axis is clear.
    expect(actions.getBoundingClientRect().width).toBe(0)
    // Browsers can make later events in the same sequence non-cancelable.
    row.dispatchEvent(new WheelEvent('wheel', { deltaX: 160, bubbles: true, cancelable: false }))
    await expect.poll(() => actions.getBoundingClientRect().width).toBeGreaterThan(100)
    const stretched = actions.getBoundingClientRect().width
    wheel(-30)
    await expect.poll(() => actions.getBoundingClientRect().width).toBeLessThan(stretched)
    expect(row.getBoundingClientRect().height).toBe(height)
    await expect.poll(() => row.getAttribute('data-state')).toBe('open')
    await expect.poll(() => actions.getBoundingClientRect().width).toBeCloseTo(88, 0)
    expect(screen.getByLabelText('deleted-session-id').element().textContent).toBe('none')
    wheel(-100)
    await expect.poll(() => row.getAttribute('data-state')).toBe('closed')
    await expect.poll(() => actions.getBoundingClientRect().width).toBe(0)
  })

  it('leaves vertical scrolling and trackpad zoom available', async () => {
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    const row = screen.getByRole('button', { name: /^Second chat/ }).element().closest('[data-swipe-actions]')!
    const vertical = new WheelEvent('wheel', { deltaX: 3, deltaY: 40, bubbles: true, cancelable: true })
    const zoom = new WheelEvent('wheel', { deltaX: 50, ctrlKey: true, bubbles: true, cancelable: true })
    row.dispatchEvent(vertical)
    row.dispatchEvent(zoom)
    expect(vertical.defaultPrevented).toBe(false)
    expect(zoom.defaultPrevented).toBe(false)
    expect(row.getAttribute('data-state')).toBe('closed')
  })

  it('reveals deletion without resizing rows or moving the mobile drawer', async () => {
    // ROOT CAUSE:
    //
    // An inline confirmation expanded an 80px row and moved the drawer upward.
    // The production deletion label also clipped Cancel at 320px. Actions must
    // occupy the existing row height, with no change to the drawer bounds.
    await page.viewport(320, 740)
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    const dialog = screen.getByRole('dialog').element()
    await expect.poll(() => Math.round(dialog.getBoundingClientRect().height)).toBe(370)
    const row = screen.getByRole('button', { name: /^Second chat/ }).element().closest('li')!
    const height = row.getBoundingClientRect().height
    await screen.getByRole('button', { name: 'Delete conversation: Second chat' }).click()
    expect(row.getBoundingClientRect().height).toBe(height)
    expect(Math.round(dialog.getBoundingClientRect().height)).toBe(370)
  })

  it('keeps the current marker and deletion actions usable at 320 pixels', async () => {
    await page.viewport(320, 740)
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    await expect.poll(() => screen.getByRole('dialog').element().getBoundingClientRect().height).toBeGreaterThanOrEqual(370)
    const current = screen.getByRole('button', { name: /^First chat/ })
    await expect.element(current).toHaveAttribute('aria-current', 'true')
    const remove = screen.getByRole('button', { name: 'Delete conversation: Second chat' })
    expect(remove.element().getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
    expect(remove.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await remove.click()
    await expect.element(screen.getByRole('button', { name: 'Delete conversation', exact: true })).toBeVisible()
    await expect.element(screen.getByLabelText('deleted-session-id')).toHaveTextContent('none')
    await screen.getByRole('button', { name: /^Second chat/ }).click()
    await expect.element(remove).toHaveAttribute('aria-expanded', 'false')
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('none')
    await expect.element(screen.getByRole('button', { name: 'Delete conversation', exact: true })).not.toBeInTheDocument()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    expect(document.querySelector('[data-vaul-handle]')).not.toBeNull()
  })

  // https://github.com/moeru-ai/airi/pull/2536#discussion_r3999211068
  it('moves keyboard focus from the fading trigger to Delete', async () => {
    // ROOT CAUSE:
    // The trigger fades and leaves the tab order while List precedes Content.
    // Opening with the keyboard must focus an action before the trigger hides.
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    const trigger = screen.getByRole('button', { name: 'Delete conversation: Second chat' })
    trigger.element().focus()
    await userEvent.keyboard('{Enter}')
    const action = screen.getByRole('button', { name: 'Delete conversation', exact: true })
    await expect.element(action).toBeVisible()
    await expect.poll(() => document.activeElement).toBe(action.element())
    await userEvent.keyboard('{Enter}')
    expect(screen.getByLabelText('deleted-session-id').element().textContent).toBe('session-two')
  })

  it('keeps only one action area open and consumes Escape before drawer dismissal', async () => {
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    const first = screen.getByRole('button', { name: 'Delete conversation: First chat' })
    const second = screen.getByRole('button', { name: 'Delete conversation: Second chat' })
    await first.click()
    await second.click()
    await expect.element(first).toHaveAttribute('aria-expanded', 'false')
    await expect.element(second).toHaveAttribute('aria-expanded', 'true')
    await second.element().focus()
    second.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect.element(second).toHaveAttribute('aria-expanded', 'false')
    await expect.element(screen.getByRole('dialog')).toBeVisible()
  })

  it('keeps the desktop surface centered and its list actions accessible', async () => {
    await page.viewport(1280, 900)
    const screen = await render(createHarness(undefined, true), { global: { plugins: [createTestI18n()] } })
    const dialog = screen.getByRole('dialog').element()
    await expect.poll(() => Math.round(dialog.getBoundingClientRect().x + dialog.getBoundingClientRect().width / 2)).toBe(640)
    expect(document.querySelector('[data-vaul-handle]')).toBeNull()
    await screen.getByRole('button', { name: /^Second chat/ }).click()
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('session-two')
  })

  it('constrains long mobile session lists to a scrollable viewport', async () => {
    await page.viewport(390, 844)
    const rows = Array.from({ length: 30 }, (_, index) => ({
      meta: sessionMeta(`session-${index}`, 30 - index),
      preview: `Chat ${index}`,
      isActive: index === 0,
      updatedAtLabel: 'now',
    }))

    await render(createHarness(rows), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    const viewport = document.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')

    expect(viewport).not.toBeNull()
    await expect.poll(() => viewport?.clientHeight ?? 0).toBeLessThan(viewport?.scrollHeight ?? 0)
    await expect.poll(() => document.querySelector('.scrollable-area-scrollbar--vertical')).not.toBeNull()

    viewport!.scrollTop = 120
    expect(viewport?.scrollTop).toBe(120)
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('keeps add, switch, and delete actions independent for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Vaul handled every pointer release on DrawerContent, including releases
    // from its action buttons, and unmounted the sheet before `click` ran.
    // The shared drawer restricts dragging to its handle. List actions must
    // still emit once without a competing gesture-release lifecycle.
    const screen = await render(createHarness(), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    expect(document.querySelector('[data-reka-scroll-area-viewport]')).not.toBeNull()

    await screen.getByRole('button', { name: 'New chat' }).click()
    await expect.element(screen.getByLabelText('created-session-count')).toHaveTextContent('1')

    await screen.getByRole('button', { name: 'Delete conversation: Second chat' }).click()
    await expect.element(screen.getByLabelText('deleted-session-id')).toHaveTextContent('none')
    await screen.getByRole('button', { name: 'Delete conversation', exact: true }).click()
    await expect.element(screen.getByLabelText('deleted-session-id')).toHaveTextContent('session-two')
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('none')

    await screen.getByRole('button', { name: /^First chat/ }).click()
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('session-one')
  })
})
