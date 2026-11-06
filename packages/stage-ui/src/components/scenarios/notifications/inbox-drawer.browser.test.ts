import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import InboxDrawer from './inbox-drawer.vue'

import { useAuthStore } from '../../../stores/auth'

describe('notifications drawer', () => {
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
      if (pathname === '/v1/inbox') {
        return Promise.resolve(Response.json({
          messages: [{ id: 'm1', kind: 'subscription.renewed', params: { plan: 'Pro', periodEnd: '2026-11-14T00:00:00Z' }, readAt: '', createdAt: '2026-10-18T08:00:00Z' }],
          nextCursor: '',
        }))
      }
      return Promise.resolve(Response.json({}))
    })
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('loads the list when the menu opens it and asks to go back', async () => {
    const auth = useAuthStore()
    auth.token = 'user-1-token'
    auth.user = { id: 'user-1', name: 'User', email: 'user@example.test', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    auth.session = { id: 's1', userId: 'user-1', token: 's1', expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() }
    await nextTick()
    const open = ref(false)
    const back = vi.fn()
    render(defineComponent({
      components: { InboxDrawer },
      setup: () => ({ open, back }),
      template: `<InboxDrawer v-model:open="open" @back="back" />`,
    }), {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    expect(routes).not.toContain('GET /v1/inbox')

    open.value = true
    await expect.element(page.getByRole('button', { name: /Pro renewed/ })).toBeVisible()
    expect(routes).toContain('GET /v1/inbox')

    await page.getByRole('button', { name: 'Back' }).click()
    expect(back).toHaveBeenCalledTimes(1)
  })
})
