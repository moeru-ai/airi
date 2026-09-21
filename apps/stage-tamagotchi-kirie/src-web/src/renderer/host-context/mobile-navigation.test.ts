import { createContext } from '@moeru/eventa'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { mobileBackRequested, mobileNavigate } from '../../shared/eventa/mobile'
import { installMobileNavigation, returnToStage } from './mobile-navigation'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/chat', '/settings', '/onboarding'].map(path => ({
      path,
      component: { render: () => null },
    })),
  })
}

describe('android single-window navigation', () => {
  // ROOT CAUSE:
  // Open Chat created an embedded Android Window, which GdKiriePlatform.Attach rejects.
  // Native navigation must update the existing leader renderer instead of creating a child.
  it('opens chat and settings on the existing router and removes listeners on disposal', async () => {
    const context = createContext()
    const router = createTestRouter()
    await router.push('/')
    const quit = vi.fn()
    const dispose = installMobileNavigation(context, router, quit)

    await context.emit(mobileNavigate, { route: '/chat', replace: false })
    expect(router.currentRoute.value.path).toBe('/chat')
    await context.emit(mobileNavigate, { route: '/settings', replace: false })
    expect(router.currentRoute.value.path).toBe('/settings')
    expect(quit).not.toHaveBeenCalled()

    dispose()
    await context.emit(mobileNavigate, { route: '/onboarding', replace: false })
    expect(router.currentRoute.value.path).toBe('/settings')
  })

  it('replaces completed onboarding and exits only for system Back at home', async () => {
    const context = createContext()
    const router = createTestRouter()
    await router.push('/onboarding')
    const quit = vi.fn()
    const dispose = installMobileNavigation(context, router, quit)

    await context.emit(mobileNavigate, { route: '/', replace: true })
    expect(router.currentRoute.value.path).toBe('/')
    await context.emit(mobileBackRequested, {})
    expect(quit).toHaveBeenCalledOnce()

    dispose()
    await context.emit(mobileBackRequested, {})
    expect(quit).toHaveBeenCalledOnce()
  })

  it('returns home after a direct route launch without exiting', async () => {
    const router = createTestRouter()
    await router.push('/chat')

    await returnToStage(router)

    expect(router.currentRoute.value.path).toBe('/')
  })
})
