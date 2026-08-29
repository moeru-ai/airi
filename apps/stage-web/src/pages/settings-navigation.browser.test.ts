import SharedSettingsIndex from '@proj-airi/stage-pages/pages/settings/index.vue'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

afterEach(() => {
  localStorage.clear()
})

async function renderSettingsIndex() {
  localStorage.setItem('settings/disable-transitions', 'false')
  localStorage.setItem('settings/use-page-specific-transitions', 'true')

  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', component: SharedSettingsIndex },
      { path: '/target', component: { template: '<div>Target page</div>' } },
    ],
  })
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: {} },
    missingWarn: false,
    fallbackWarn: false,
  })

  await router.push('/settings')
  await router.isReady()

  const screen = await render(RouterView, {
    global: {
      plugins: [pinia, i18n, router],
      directives: { motion: {} },
      stubs: {
        IconItem: true,
        RippleGrid: true,
      },
    },
  })

  return { router, screen }
}

describe('settings index navigation', () => {
  it('does not block navigation when page-specific transitions are enabled', async () => {
    // ROOT CAUSE:
    //
    // The settings index registered a route guard that waited for a callback
    // with no caller. Every later navigation remained pending.
    const { router, screen } = await renderSettingsIndex()

    const result = await Promise.race([
      router.push('/target').then(() => 'completed'),
      new Promise<string>(resolve => setTimeout(resolve, 250, 'blocked')),
    ])

    expect(result).toBe('completed')
    expect(router.currentRoute.value.path).toBe('/target')
    await expect.element(screen.getByText('Target page')).toBeVisible()

    screen.unmount()
  })
})
