import type { Pinia } from 'pinia'

import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechProviderSettings from './speech-provider-settings.vue'

import { useProviderConfigStore } from '../../../stores/providers/config'

const providerId = 'minimax-speech'

const SAVE_DEBOUNCE_MS = 1000

async function mountSettings(pinia: Pinia) {
  const i18n = createI18n({
    // Every label resolves to its own key. These cases assert on store state,
    // so they need no message catalogue.
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
  })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()

  await page.viewport(1100, 1100)

  return await render(SpeechProviderSettings, {
    props: { providerId, defaultModel: 'speech-2.8-hd' },
    global: {
      plugins: [pinia, PiniaColada, i18n, router],
      // The settings layout animates its header. The application installs the
      // motion plugin at its own entrypoint.
      directives: { motion: {} },
    },
  })
}

/** Parks provider validation so an edit can land while the save flow waits. */
function parkProviderValidation(pinia: Pinia) {
  let reportStarted!: () => void
  let release!: () => void
  const started = new Promise<void>((resolve) => {
    reportStarted = resolve
  })
  const parked = new Promise<void>((resolve) => {
    release = resolve
  })

  const validate = vi.fn(async () => {
    reportStarted()
    await parked
    return true
  })

  // The provider store calls `useI18n`, so it exists only inside the mounted
  // application. A plugin is the seam that reaches it from the test body.
  pinia.use(({ store }) => {
    if (store.$id === 'provider')
      store.validateProvider = validate
  })

  return { started, release, validate }
}

describe('speech provider settings save flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // ROOT CAUSE:
  //
  // The flow validates the provider inside the promise owning the patch queue.
  // An edit whose debounce fired during that await returned that promise, so
  // its patch stayed queued: the loop had exited and the owner was cleared.
  //
  // The drain now rechecks the queue after validating.
  it('saves an edit that arrives while provider validation is pending', async () => {
    const pinia = createPinia()
    const validation = parkProviderValidation(pinia)

    await mountSettings(pinia)

    const firstEdit = page.getByPlaceholder('API Key')
    await firstEdit.fill('key-entered-first')

    // The first patch reached the queue and the flow parked in validation.
    await validation.started
    expect(useProviderConfigStore(pinia).getProviderConfig(providerId)?.apiKey).toBe('key-entered-first')

    // A different field, edited while validation still runs. Advanced settings
    // start collapsed, and the base URL lives there. The empty message
    // catalogue renders every label as its own key, which is a stable handle.
    await page.getByText('settings.pages.providers.common.section.advanced.title').click()
    await page.getByRole('textbox', { name: /Base URL/ }).fill('https://proxy.example.com')

    // Let that edit's debounce fire. It finds the in-flight drain and returns it.
    await new Promise(resolve => setTimeout(resolve, SAVE_DEBOUNCE_MS + 500))

    validation.release()

    await expect.poll(() => useProviderConfigStore(pinia).getProviderConfig(providerId)?.baseUrl, { timeout: 5000 })
      .toBe('https://proxy.example.com')
    await expect.poll(() => {
      const stored = localStorage.getItem('settings/providers/configured')
      if (!stored)
        return undefined
      return JSON.parse(stored)[providerId]?.config?.baseUrl
    }, { timeout: 5000 }).toBe('https://proxy.example.com')
  }, 30_000)

  // A field that arrives before validation is the ordinary path, and it must
  // keep working after the drain gained a second cycle.
  it('keeps the first save when validation runs without a late edit', async () => {
    const pinia = createPinia()
    const validation = parkProviderValidation(pinia)

    await mountSettings(pinia)
    await page.getByPlaceholder('API Key').fill('key-entered-first')
    await validation.started
    validation.release()

    await expect.poll(() => useProviderConfigStore(pinia).getProviderConfig(providerId)?.apiKey, { timeout: 5000 })
      .toBe('key-entered-first')
    expect(validation.validate).toHaveBeenCalledOnce()
  }, 30_000)
})
