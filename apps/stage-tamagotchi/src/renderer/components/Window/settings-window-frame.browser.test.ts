import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SettingsWindowFrame from './settings-window-frame.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

// NOTICE:
// The window state lives in the Electron main process. The double stands in for it, so the title bar can mount.
// Removal condition: browser tests running inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ({ value: { on: () => () => {} } }),
  useElectronEventaInvoke: () => vi.fn(async () => undefined),
}))

async function renderFrame(path: string, enabled: boolean) {
  const empty = defineComponent(() => () => null)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', component: empty, meta: { layout: 'settings' } },
      { path: '/about', component: empty, meta: { layout: 'plain' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: { settings: { title: 'Settings' } } } })
  return render(defineComponent(() => () => h(SettingsWindowFrame, { enabled }, () => h('main', 'Page'))), {
    global: { plugins: [router, i18n] },
  })
}

describe('settings window frame', () => {
  it('draws the title bar and moves the page below it on a settings route', async () => {
    await renderFrame('/settings', true)

    await expect.element(page.getByTestId('window-title-bar')).toBeVisible()
    await expect.element(page.getByText('Settings')).toBeVisible()
    await expect.element(page.getByText('Page')).toBeVisible()
    const pageTop = page.getByText('Page').element().getBoundingClientRect().top
    expect(pageTop).toBeGreaterThanOrEqual(44)
  })

  it('leaves other routes as they are', async () => {
    await renderFrame('/about', true)

    await expect.element(page.getByText('Page')).toBeVisible()
    expect(page.getByTestId('window-title-bar').elements()).toHaveLength(0)
  })

  it('draws no title bar in a window that hosts the fullscreen mode', async () => {
    await renderFrame('/settings', false)

    await expect.element(page.getByText('Page')).toBeVisible()
    expect(page.getByTestId('window-title-bar').elements()).toHaveLength(0)
  })
})
