import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import StepWelcome from './step-welcome.vue'

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
