import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { installKirieAndroidNavigation } from './kirie-android-navigation'

function createNavigation() {
  const history = createMemoryHistory()
  // NOTICE:
  // The Android asset WebView leaves same-document native traversal unchanged.
  // Source: kirie-android-navigation.ts documents the recorded WebView failure.
  // Remove this boundary fixture when native traversal replaces the custom stack.
  history.go = vi.fn()
  const router = createRouter({
    history,
    routes: [
      { path: '/', component: {} },
      { path: '/settings', component: {} },
      { path: '/settings/providers', component: {} },
      { path: '/:all(.*)', name: '/[...all]', component: {} },
    ],
  })
  installKirieAndroidNavigation(router)
  return router
}

// Source: apps/stage-pocket/src/pages/[...all].vue calls router.go(-1).
describe('kirie Android route traversal', () => {
  it.each(['/devtools/chat', '/settings/providers/transcription/sherpaw-transcription'])(
    'returns from the missing route %s with Go Back',
    async (missingRoute) => {
      const router = createNavigation()
      await router.push('/settings/system/developer')
      await router.push(missingRoute)
      router.go(-1)
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/system/developer'))
    },
  )

  it('retains forward entries and truncates them after a new push', async () => {
    const router = createNavigation()
    await router.push('/settings')
    await router.push('/settings/system')
    await router.push('/devtools/chat')
    router.go(-2)
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings'))
    router.forward()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/system'))
    await router.push('/settings/memory')
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/system'))
    router.forward()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/memory'))
  })

  it('keeps the cursor when a route guard cancels traversal', async () => {
    const router = createNavigation()
    await router.push('/settings')
    await router.push('/devtools/chat')
    const remove = router.beforeEach(to => to.fullPath !== '/settings')
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/devtools/chat'))
    await new Promise(resolve => setTimeout(resolve, 0))
    remove()
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings'))
  })

  // Source: settings/providers/index.vue replaces the hash when its category changes.
  it.each(['replace', 'push-with-replace'])(
    'does not add provider category replacements as Back stops through %s',
    async (operation) => {
      const router = createNavigation()
      await router.push('/settings')
      await router.push('/settings/providers')
      if (operation === 'replace') {
        await router.replace({ hash: '#chat' })
        await router.replace({ hash: '#vision' })
      }
      else {
        await router.push({ hash: '#chat', replace: true })
        await router.push({ hash: '#vision', replace: true })
      }
      router.back()
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings'))
      router.forward()
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/providers#vision'))
    },
  )

  it('does not record a canceled replacement', async () => {
    const router = createNavigation()
    await router.push('/settings')
    await router.push('/settings/providers')
    const remove = router.beforeEach(to => to.hash !== '#vision')
    await router.replace({ hash: '#vision' })
    remove()
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings'))
  })

  // Source: recordings-android/android-g01-g05-final-f12e-2026-10-07/results/
  // g01-not-found-system-back.json
  // ROOT CAUSE:
  //
  // Kirie routed system Back through router.back() for every route.
  // Pocket uses WebView.goBack(), which leaves this catch-all history state unchanged.
  //
  // The native callback now ignores the matched catch-all record.
  // router.back() continues to use the custom history.
  it('separates native Back from router.back() on the matched catch-all route', async () => {
    const router = createNavigation()
    await router.push('/')
    await router.push('/airi-replay-absent-f12e')
    expect(router.currentRoute.value.matched.at(-1)).toMatchObject({
      name: '/[...all]',
      path: '/:all(.*)',
    })

    window.__airiKirieAndroidBack?.()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(router.currentRoute.value.fullPath).toBe('/airi-replay-absent-f12e')

    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/'))
  })

  it('reloads a matched route when Android system Back runs', async () => {
    const router = createNavigation()
    await router.push('/')
    await router.push('/settings')
    window.__airiKirieAndroidBack?.()
    expect(router.options.history.go).toHaveBeenCalledWith(0)
    expect(router.currentRoute.value.fullPath).toBe('/settings')
  })

  it('keeps the first route unchanged on Android system Back', async () => {
    const router = createNavigation()
    await router.push('/')
    window.__airiKirieAndroidBack?.()
    expect(router.options.history.go).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
