import type { App } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import { loadAnalyticsAdapter } from '../modules/analytics'
import VerifyEmail from './verify-email.vue'

const capture = vi.fn()

let app: App | undefined
let host: HTMLDivElement | undefined

/** Mounts the production page with real routing, i18n, and browser channel behavior. */
async function mountResult(query: string) {
  capture.mockClear()
  await loadAnalyticsAdapter(async () => ({ capture, identify: vi.fn() }))
  const broadcast = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/verify-email', component: VerifyEmail },
      { path: '/sign-in', component: VerifyEmail },
    ],
  })
  await router.push(`/verify-email?${query}`)
  await router.isReady()
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(VerifyEmail)
  app.use(router)
  app.use(createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: { server: { auth: { verifyEmail: {
      title: { failed: 'Verification failed', success: 'Email verified', pending: 'Check your email' },
      message: { failed: 'Verification failed: {error}', success: 'You can return to AIRI.' },
      action: { backToSignIn: 'Sign in' },
    } } } } },
  }))
  app.mount(host)
  await nextTick()
  return { capture, broadcast, host }
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
})

describe('verification result side effects', () => {
  // https://github.com/moeru-ai/airi/pull/2723
  // ROOT CAUSE:
  // Failed callbacks retain verified=true. Handle errors first to suppress success analytics and channel messages.
  it.each(['INVALID_TOKEN', 'TOKEN_EXPIRED'])('does not announce success for %s with the success flag present', async (error) => {
    const { capture, broadcast, host } = await mountResult(`verified=true&error=${error}`)
    expect(host.textContent).toContain('Verification failed')
    expect(capture).toHaveBeenCalledWith('email_verification_failed', {}, undefined)
    expect(capture).not.toHaveBeenCalledWith('email_verification_completed', {}, undefined)
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('announces successful verification when no error is present', async () => {
    const { capture, broadcast, host } = await mountResult('verified=true')
    expect(host.textContent).toContain('Email verified')
    expect(capture).toHaveBeenCalledWith('email_verification_completed', {}, undefined)
    expect(capture).not.toHaveBeenCalledWith('email_verification_failed', {}, undefined)
    expect(broadcast).toHaveBeenCalledWith('verified')
  })
})
