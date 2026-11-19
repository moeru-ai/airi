import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAuthStore } from '../stores/auth'
import { useFluxStatus } from './use-flux-status'

/** Renders what every Flux entry shows: nothing when hidden, otherwise the value and its icon. */
const FluxEntry = defineComponent(() => {
  const { visible, valueLabel, icon } = useFluxStatus()
  return () => visible.value ? h('a', { 'data-icon': icon.value, 'data-testid': 'flux-entry' }, valueLabel.value) : null
})

describe('useFluxStatus', () => {
  let pinia: ReturnType<typeof createPinia>
  let wallet: { flux: number, capacitorPercent: number | null }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    wallet = { flux: 9620, capacitorPercent: null }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({ ...wallet, capacitorRechargesAt: null, fallbackToFlux: false }))
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    localStorage.clear()
    vi.restoreAllMocks()
  })

  function renderEntry(signedIn: boolean) {
    if (signedIn) {
      const now = new Date()
      useAuthStore().$patch({
        user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
        session: { id: 'session-owner', userId: 'owner', token: 'owner-token', createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000) },
        token: 'owner-token',
      })
    }
    return render(FluxEntry, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })] },
    })
  }

  it('hides every Flux entry from a signed-out user, who can use AIRI without the cloud', async () => {
    const screen = renderEntry(false)

    expect(screen.getByTestId('flux-entry').elements()).toHaveLength(0)
  })

  it('shows the Flux balance to a user without a subscription', async () => {
    const screen = renderEntry(true)

    await expect.element(screen.getByTestId('flux-entry')).toHaveTextContent('9,620')
    await expect.element(screen.getByTestId('flux-entry')).toHaveAttribute('data-icon', 'i-solar:battery-charge-bold-duotone')
  })

  it('shows the Capacitor percent to a subscriber', async () => {
    wallet = { flux: 9620, capacitorPercent: 40 }
    const screen = renderEntry(true)

    await expect.element(screen.getByTestId('flux-entry')).toHaveTextContent('40%')
    await expect.element(screen.getByTestId('flux-entry')).toHaveAttribute('data-icon', 'i-solar:star-bold-duotone')
  })
})
