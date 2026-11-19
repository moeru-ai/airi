import en from '@proj-airi/i18n/locales/en'
import zhHans from '@proj-airi/i18n/locales/zh-Hans'

import { createFallbackOptions } from '@proj-airi/i18n'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import StepWelcome from './step-welcome.vue'

import { AIRI_FLUX_URL, AIRI_TERMS_URL } from '../../../../constants/public-links'
import { useAuthStore } from '../../../../stores/auth'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'

afterEach(() => {
  vi.unstubAllEnvs()
  // The card store keeps its cards in the local storage.
  localStorage.clear()
})

/** Creates the production English localization surface used by onboarding stores. */
function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en,
    },
  })
}

/** Renders the welcome step with real Pinia and i18n plugins. */
async function renderWelcomeStep(customProviderSetupEnabled: boolean) {
  return render(StepWelcome, {
    props: {
      customProviderSetupEnabled,
      onNext: vi.fn(),
    },
    global: {
      directives: {
        motion: {},
      },
      plugins: [createPinia(), createTestI18n()],
    },
  })
}

/**
 * @example
 * describe('Steam onboarding provider restrictions', () => {})
 */
describe('steam onboarding provider restrictions', () => {
  /**
   * @example
   * it('keeps login without custom provider setup in Steam builds', async () => {})
   */
  it('keeps login without custom provider setup in Steam builds', async () => {
    // ROOT CAUSE:
    //
    // The welcome step rendered its local-provider action without consulting
    // the distribution restriction already used by settings and provider stores.
    // A clean Steam install therefore exposed BYOK during onboarding even though
    // the same provider paths were hidden after setup.
    await renderWelcomeStep(false)

    expect(document.body.textContent).toContain('Sign in')
    expect(document.body.textContent).not.toContain('Setup with your provider')
  })

  /**
   * @example
   * it('keeps custom provider setup in direct builds', async () => {})
   */
  it('keeps custom provider setup in direct builds', async () => {
    await renderWelcomeStep(true)

    expect(document.body.textContent).toContain('Setup with your provider')
  })
})

describe('desktop onboarding sign-in', () => {
  it('requests login through the auth store', async () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
    const pinia = createPinia()
    const screen = await render(StepWelcome, {
      props: {
        customProviderSetupEnabled: true,
        onNext: vi.fn(),
      },
      global: {
        directives: { motion: {} },
        plugins: [pinia, createTestI18n()],
      },
    })

    await screen.getByRole('button', { name: 'Sign in' }).click()

    await expect.poll(() => useAuthStore(pinia).needsLogin).toBe(true)
  })
})

describe('onboarding public links', () => {
  it('links to public pricing and terms without requiring sign-in', async () => {
    const screen = await renderWelcomeStep(true)

    await expect.element(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', AIRI_FLUX_URL)
    await expect.element(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', AIRI_TERMS_URL)
  })
})

describe('onboarding language choice', () => {
  /** Renders the welcome step in English, in an app that creates the built-in card as a first start does. */
  async function renderWithBuiltInCard() {
    const pinia = createPinia()
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en, 'zh-Hans': zhHans }, ...createFallbackOptions(console.warn) })
    const App = defineComponent({
      setup() {
        // The card store creates its runtime stores in the setup of the app, where they can bind i18n.
        void useAiriCardStore().initialize()
        return () => h(StepWelcome, { customProviderSetupEnabled: true, onNext: vi.fn() })
      },
    })
    await render(App, {
      global: {
        directives: { motion: {} },
        plugins: [pinia, i18n],
      },
    })
    const cardStore = useAiriCardStore(pinia)
    await expect.poll(() => cardStore.getCard('default')).toBeDefined()
    return { cardStore, i18n }
  }

  it('gives the built-in card the description of the chosen language', async () => {
    const { cardStore, i18n } = await renderWithBuiltInCard()
    const english = cardStore.builtInCard.description
    expect(cardStore.getCard('default')?.description).toBe(english)

    i18n.global.locale.value = 'zh-Hans'

    await expect.poll(() => cardStore.getCard('default')?.description).not.toBe(english)
    expect(cardStore.getCard('default')?.description).toBe(cardStore.builtInCard.description)
  })

  it('keeps a description that the user edited', async () => {
    const { cardStore, i18n } = await renderWithBuiltInCard()
    const english = cardStore.builtInCard.description
    await cardStore.updateCard('default', { ...cardStore.builtInCard, description: 'My own persona' })

    i18n.global.locale.value = 'zh-Hans'
    await nextTick()

    expect(cardStore.builtInCard.description).not.toBe(english)
    expect(cardStore.getCard('default')?.description).toBe('My own persona')
  })
})
