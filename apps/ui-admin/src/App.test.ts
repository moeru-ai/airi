// @vitest-environment jsdom

import type { App as VueApp } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'

import { AdminApiError } from './modules/api'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
}))

vi.mock('./modules/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./modules/api')>()
  return {
    ...actual,
    adminApi: {
      me: mocks.me,
    },
  }
})

describe('admin app shell', () => {
  let app: VueApp<Element>
  let host: HTMLElement

  beforeEach(() => {
    mocks.me.mockRejectedValue(new AdminApiError('unauthorized', 401, null))
    window.history.replaceState(null, '', '/llm-router?api_server_url=https%3A%2F%2Fapi.airi.build')
    document.body.innerHTML = '<div id="app"></div>'
    host = document.querySelector('#app')!
  })

  afterEach(() => {
    app.unmount()
    vi.clearAllMocks()
  })

  it('shows a sign-in page with backend switching instead of immediately redirecting on 401', async () => {
    const router = createRouter({
      history: createWebHistory('/'),
      routes: [
        { path: '/llm-router', component: { template: '<div />' } },
      ],
    })
    app = createApp(App)
    app.use(router)
    app.mount(host)
    await router.isReady()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/llm-router')
    expect(host.textContent).toContain('Sign in to AIRI Admin')
    expect(host.textContent).toContain('Production - api.airi.build')
    const href = host.querySelector('a')?.getAttribute('href')
    expect(href).toContain('https://api.airi.build/auth/sign-in?redirect=')
    expect(decodeURIComponent(href ?? '')).toContain('api_server_url=https%3A%2F%2Fapi.airi.build')
  })
})

async function flushPromises() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
