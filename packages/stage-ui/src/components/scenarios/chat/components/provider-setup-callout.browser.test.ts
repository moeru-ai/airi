import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ProviderSetupCallout from './provider-setup-callout.vue'

import { useAuthStore } from '../../../../stores/auth'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  localStorage.clear()
})

async function renderCallout(pinia = createPinia()) {
  const onConfigure = vi.fn()
  const onSignIn = vi.fn()
  const screen = await render(ProviderSetupCallout, {
    props: { onConfigure, onSignIn },
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
  return { screen, onConfigure, onSignIn }
}

describe('chat provider setup callout', () => {
  it('suggests sign-in first when the user is signed out', async () => {
    const { screen, onConfigure, onSignIn } = await renderCallout()

    await expect.element(screen.getByText('Sign in to start chatting')).toBeVisible()
    await screen.getByRole('button', { name: 'Sign in' }).click()
    await screen.getByRole('button', { name: 'Open provider settings' }).click()

    expect(onSignIn).toHaveBeenCalledTimes(1)
    expect(onConfigure).toHaveBeenCalledTimes(1)
  })

  it('offers only sign-in when the build turns off custom providers', async () => {
    vi.stubEnv('VITE_DISABLE_CUSTOM_PROVIDERS', 'true')
    const { screen } = await renderCallout()

    await expect.element(screen.getByRole('button', { name: 'Sign in' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open provider settings' }).query()).toBeNull()
    expect(document.body.textContent).not.toContain('set up your own provider')
  })

  it('opens provider settings when a signed-in user has no ready provider', async () => {
    // Sign-in starts a credit refresh. Answer it so the test needs no server.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ flux: 0 }))
    const pinia = createPinia()
    const authStore = useAuthStore(pinia)
    authStore.user = { id: 'user', name: 'user', email: 'user@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    authStore.session = { id: 'session', userId: 'user', token: 'token', expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() }
    const { screen, onConfigure } = await renderCallout(pinia)

    await expect.element(screen.getByText('Chat provider isn\'t configured')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign in' }).query()).toBeNull()
    await screen.getByRole('button', { name: 'Open provider settings' }).click()

    expect(onConfigure).toHaveBeenCalledTimes(1)
  })
})
