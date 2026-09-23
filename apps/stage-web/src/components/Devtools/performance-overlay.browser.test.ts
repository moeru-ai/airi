import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import PerformanceOverlay from './PerformanceOverlay.vue'

import { useDevtoolsLagStore } from '../../stores/devtools-lag'

import 'virtual:uno.css'

describe('performance overlay recording controls', () => {
  it('keeps CSV export separate from stopping a recording', async () => {
    // ROOT CAUSE:
    //
    // The overlay exported a CSV file when the user stopped a recording.
    // The settings page only saved the recording, so the same action had two
    // different outcomes. We keep export as a separate explicit action.
    const pinia = createPinia()
    const store = useDevtoolsLagStore(pinia)
    const exportCsv = vi.spyOn(store, 'exportCsv')
    store.enabled.fps = true

    const screen = await render(PerformanceOverlay, {
      global: {
        plugins: [
          pinia,
          createI18n({
            legacy: false,
            locale: 'en',
            messages: {
              en,
            },
          }),
        ],
      },
    })

    await screen.getByRole('button', { name: 'Record', exact: true }).click()
    expect(store.recording).toBe(true)

    await screen.getByRole('button', { name: 'Stop', exact: true }).click()
    expect(store.recording).toBe(false)
    expect(exportCsv).not.toHaveBeenCalled()

    store.toggleAll(false)
  })
})
