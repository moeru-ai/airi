import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CustomModelWebLimitCallout from './custom-model-web-limit-callout.vue'

function createEnglishI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

describe('custom model web limit callout', () => {
  it('shows the Web CORS, network, and TLS limit on Web', async () => {
    const screen = await render(CustomModelWebLimitCallout, {
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    expect(screen.container.textContent).toContain('CORS')
    expect(screen.container.textContent).toMatch(/network/i)
    expect(screen.container.textContent).toMatch(/TLS/i)
  })
})
