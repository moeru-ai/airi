import en from '@proj-airi/i18n/locales/en'

import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import AuthStatusIsland from './auth-status-island.vue'

import { useAuthStatusStore } from '../../stores/auth-status'

import '../../styles/transitions.css'
import 'virtual:uno.css'

vi.mock('@proj-airi/electron-vueuse', () => ({ useElectronEventaInvoke: () => vi.fn() }))

it('replaces the login request icon with a success check without hearing bars', async () => {
  // ROOT CAUSE:
  // The shared shell used to render audio bars for every business state,
  // leaving five idle dots beside the sign-in success check.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useAuthStatusStore()
  store.status = { attemptId: 'login-test', state: 'waiting' }
  const screen = render(AuthStatusIsland, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  const button = screen.getByRole('button')
  expect(button.element().querySelector('.auth-pending')).not.toBeNull()
  const spinner = button.element().querySelector('[data-icon="a"]')!
  const check = button.element().querySelector('[data-icon="b"]')!
  store.status = { attemptId: 'login-test', state: 'confirming' }
  await nextTick()
  expect(button.element().querySelector('[data-icon="a"]')).toBe(spinner)
  expect(getComputedStyle(spinner).opacity).toBe('1')

  // ROOT CAUSE:
  // Keying the spinning icon by auth phase under out-in removed it before the
  // replacement entered. Rotation also shared the transition target. Keep
  // both symbols mounted and rotate only the spinner's inner element.
  store.status = { attemptId: 'login-test', state: 'success' }
  await nextTick()
  const start = performance.now()
  do {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const opacity = Number(getComputedStyle(spinner).opacity) + Number(getComputedStyle(check).opacity)
    expect(opacity).toBeGreaterThan(0.9)
    expect(spinner.getBoundingClientRect().width).toBeGreaterThan(0)
  } while (performance.now() - start < 350)
  await expect.element(button).toHaveAccessibleName('Signed in')
  await expect.poll(() => getComputedStyle(spinner).opacity).toBe('0')
  expect(getComputedStyle(check).opacity).toBe('1')
  await expect.poll(() => button.element().querySelector('[class*="check-circle"]')).not.toBeNull()
  expect(button.element().querySelector('[class*="hearing-bar"], [class*="status-bar"]')).toBeNull()
})
