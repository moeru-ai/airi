import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import InboxPopover from './inbox-popover.vue'

import { useAuthStore } from '../../../stores/auth'

const messages = [
  { id: 'm1', kind: 'flux.granted', params: { amount: 500, reason: 'Thanks for testing.' }, readAt: '', createdAt: '2026-10-18T08:00:00Z' },
  { id: 'm2', kind: 'account.banned', params: {}, readAt: '', createdAt: '2026-10-17T08:00:00Z' },
]

describe('notifications popover', () => {
  let pinia: ReturnType<typeof createPinia>
  let routes: string[]

  beforeEach(() => {
    localStorage.clear()
    routes = []
    pinia = createPinia()
    setActivePinia(pinia)
    // Cloud and the Auth credit read are the HTTP boundaries of this component.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const request = input instanceof Request ? input : new Request(input)
      const { pathname } = new URL(request.url)
      if (pathname.includes('/flux'))
        return Promise.resolve(Response.json({ flux: 0 }))
      routes.push(`${request.method} ${pathname}`)
      if (pathname === '/v1/inbox/unread-count')
        return Promise.resolve(Response.json({ unread: 1 }))
      if (pathname === '/v1/inbox')
        return Promise.resolve(Response.json({ messages, nextCursor: '' }))
      return Promise.resolve(Response.json({}))
    })
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
    localStorage.clear()
  })

  async function renderPopover() {
    const harness = defineComponent({
      components: { InboxPopover },
      setup: () => ({ open: ref(false) }),
      template: `
        <InboxPopover v-model:open="open">
          <div>
            <button type="button" @click="open = true">Account menu item</button>
            <button type="button">Account trigger</button>
          </div>
        </InboxPopover>
      `,
    })
    return render(harness, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
  }

  async function signIn() {
    const auth = useAuthStore()
    auth.token = 'user-1-token'
    auth.user = { id: 'user-1', name: 'User', email: 'user@example.test', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    auth.session = { id: 's1', userId: 'user-1', token: 's1', expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() }
    await nextTick()
  }

  it('shows no card while signed out', async () => {
    const screen = await renderPopover()

    await screen.getByRole('button', { name: 'Account menu item' }).click()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(routes).toEqual([])
  })

  it('loads the list on open, skips unknown kinds, and marks an opened message read', async () => {
    const screen = await renderPopover()
    await signIn()
    await expect.poll(() => routes).toContain('GET /v1/inbox/unread-count')
    expect(routes).not.toContain('GET /v1/inbox')

    await screen.getByRole('button', { name: 'Account menu item' }).click()
    const row = page.getByRole('button', { name: /You received 500 Flux/ })
    await expect.element(row).toBeVisible()
    expect(routes).toContain('GET /v1/inbox')
    expect(document.body.textContent).not.toContain('account.banned')

    // The account menu returns focus to its trigger after it closes. The card must stay open.
    screen.getByRole('button', { name: 'Account trigger' }).element().focus()
    await expect.element(row).toBeVisible()

    await row.click()
    await expect.poll(() => routes).toContain('POST /v1/inbox/m1/read')
    await expect.element(page.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  })
})
