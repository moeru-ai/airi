import type { ChatSessionMeta } from '../../../../types/chat-session'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
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
              'delete': 'Delete',
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

      return {
        created,
        deleted,
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
        @delete-session="deleted = $event"
      />
      <output aria-label="created-session-count">{{ created }}</output>
      <output aria-label="selected-session-id">{{ selected }}</output>
      <output aria-label="deleted-session-id">{{ deleted }}</output>
    `,
  })
}

describe('sessions dialog actions', () => {
  it('keeps the current marker and deletion confirmation usable at 320 pixels', async () => {
    await page.viewport(320, 740)
    const screen = await render(createHarness(), { global: { plugins: [createTestI18n()] } })
    await expect.poll(() => screen.getByRole('dialog').element().getBoundingClientRect().height).toBeGreaterThanOrEqual(370)
    const current = screen.getByRole('button', { name: /^First chat/ })
    await expect.element(current).toHaveAttribute('aria-current', 'true')
    const remove = screen.getByRole('button', { name: 'Delete: Second chat' })
    expect(remove.element().getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
    expect(remove.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await remove.click()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Delete this conversation and its messages?')
    await expect.element(screen.getByLabelText('deleted-session-id')).toHaveTextContent('none')
    await screen.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect.element(remove).toHaveFocus()
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    expect(document.querySelector('[data-vaul-handle]')).not.toBeNull()
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

    await screen.getByRole('button', { name: 'Delete: Second chat' }).click()
    await expect.element(screen.getByLabelText('deleted-session-id')).toHaveTextContent('none')
    await screen.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.element(screen.getByLabelText('deleted-session-id')).toHaveTextContent('session-two')
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('none')

    await screen.getByRole('button', { name: /^First chat/ }).click()
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('session-one')
  })
})
