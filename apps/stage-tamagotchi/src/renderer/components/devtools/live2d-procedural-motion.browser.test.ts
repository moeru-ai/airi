import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import Live2DProceduralMotion from './live2d-procedural-motion.vue'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
  })
}

describe('live2d procedural motion', () => {
  afterEach(() => cleanup())

  it('places the model selector above the model details', async () => {
    const screen = await render(Live2DProceduralMotion, {
      global: { plugins: [createTestI18n()] },
    })

    const panel = screen.container.querySelector('section')
    const modelSelector = panel?.querySelector('.select-tab')

    expect(modelSelector).not.toBeNull()
    expect(panel?.firstElementChild).toBe(modelSelector)
  })
})
