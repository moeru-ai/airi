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
    routes: [{ path: '/:pathMatch(.*)*', component: {} }],
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

  it('consumes Back at the first route', async () => {
    const router = createNavigation()
    await router.push('/')
    window.__airiKirieAndroidBack?.()
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
