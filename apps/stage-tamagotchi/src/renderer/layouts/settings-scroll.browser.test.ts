import en from '@proj-airi/i18n/locales/en'
import SettingsLayout from '@proj-airi/stage-layouts/layouts/settings'

import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

async function renderSettings() {
  const LongPage = defineComponent({
    template: '<div style="height: 2400px">Settings content</div>',
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/',
      component: SettingsLayout,
      children: [
        { path: 'settings/modules', component: LongPage },
        { path: 'settings/modules/beat-sync', component: LongPage },
        { path: 'devtools/beat-sync', component: LongPage },
      ],
    }],
  })
  await router.push('/settings/modules')
  await router.isReady()

  const screen = render(defineComponent({
    components: { RouterView },
    template: '<div style="height: 600px; width: 600px"><RouterView /></div>',
  }), {
    global: {
      plugins: [createPinia(), router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
  const viewport = screen.container.querySelector<HTMLElement>('#settings-scroll-container')
  if (!viewport)
    throw new Error('Expected the shared settings scroll container.')

  await expect.poll(() => viewport.scrollHeight - viewport.clientHeight).toBeGreaterThan(600)
  return { router, screen, viewport }
}

describe('shared settings route scrolling', () => {
  it('starts settings and devtools pages at the top of the reused viewport', async () => {
    // ROOT CAUSE:
    // The shared layout keeps its scroll container when RouterView changes pages.
    // A click near the bottom of the modules list left Beat Sync at that offset.
    // Reset the owned viewport after a different page is rendered.
    const { router, screen, viewport } = await renderSettings()
    viewport.scrollTop = 600
    expect(viewport.scrollTop).toBe(600)

    await router.push('/settings/modules/beat-sync')
    await nextTick()
    expect(screen.container.querySelector('#settings-scroll-container')).toBe(viewport)
    expect(viewport.scrollTop).toBe(0)

    viewport.scrollTop = 400
    await router.push('/devtools/beat-sync')
    await nextTick()
    expect(viewport.scrollTop).toBe(0)
  })

  it('preserves scrolling for query and anchor changes within the same page', async () => {
    const { router, viewport } = await renderSettings()
    viewport.scrollTop = 600

    await router.push('/settings/modules?filter=audio')
    await nextTick()
    expect(viewport.scrollTop).toBe(600)

    await router.push('/settings/modules?filter=audio#advanced')
    await nextTick()
    expect(viewport.scrollTop).toBe(600)
  })
})
