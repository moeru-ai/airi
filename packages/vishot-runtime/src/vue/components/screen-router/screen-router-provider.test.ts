// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp, h, inject, nextTick, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import ScreenRouterProvider from './screen-router-provider.vue'

import { injectSceneRouterStore } from './context'

function mountProviderWithQuery() {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const activeCaptureRootId = ref<string | null>(null)

  const Probe = {
    setup() {
      const sceneRouterStore = inject(injectSceneRouterStore, null)

      onMounted(() => {
        if (!sceneRouterStore) {
          return
        }

        const routePath = '/docs/setup-and-use'
        sceneRouterStore.registerCaptureRoot({
          id: 'manual-chat-window',
          routePath,
          title: 'Manual Chat Window',
        })
        sceneRouterStore.registerCaptureRoot({
          id: 'intro-chat-window',
          routePath,
          title: 'Intro Chat Window',
        })

        activeCaptureRootId.value = sceneRouterStore.activeCaptureRootId.value
      })

      return () => h('div')
    },
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/docs/setup-and-use', component: Probe }],
  })

  const app = createApp({
    render: () => h(ScreenRouterProvider, null, { default: () => h(Probe) }),
  })
  app.use(router)

  return { app, host, router, activeCaptureRootId }
}

describe('scene-router-provider', () => {
  it('ignores stale capture query ids that are not registered on the current route', async () => {
    const { app, host, router, activeCaptureRootId } = mountProviderWithQuery()

    await router.push({ path: '/docs/setup-and-use', query: { capture: 'manual-settings-window' } })
    await router.isReady()
    app.mount(host)
    await nextTick()
    await nextTick()

    expect(activeCaptureRootId.value).toBeNull()

    app.unmount()
    host.remove()
  })

  it('keeps capture query ids that are registered on the current route', async () => {
    const { app, host, router, activeCaptureRootId } = mountProviderWithQuery()

    await router.push({ path: '/docs/setup-and-use', query: { capture: 'manual-chat-window' } })
    await router.isReady()
    app.mount(host)
    await nextTick()
    await nextTick()

    expect(activeCaptureRootId.value).toBe('manual-chat-window')

    app.unmount()
    host.remove()
  })
})
