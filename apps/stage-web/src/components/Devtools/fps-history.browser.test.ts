import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import FpsHistory from './fps-history.vue'

describe('fps history', () => {
  it('places a slow frame at its timestamp and keeps the FPS scale above 60 when needed', async () => {
    const screen = await render(FpsHistory, {
      props: {
        samples: [
          { ts: 900, value: 500 },
          { ts: 1000, value: 120 },
          { ts: 1100, value: 60 },
          { ts: 1800, value: 10 },
          { ts: 2100, value: 500 },
        ],
        startedAt: 1000,
        stoppedAt: 2000,
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    // A histogram loses time order. Equal spacing would also hide the 700 ms gap before the slow frame.
    const chart = screen.getByRole('img', { name: 'FPS history' }).element()
    expect(chart.querySelector('polyline')?.getAttribute('points')).toBe('0,0 30,30 240,55')
    await expect.element(screen.getByText('Latest 10', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('Min 10 / Max 120', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('-1 s', { exact: true })).toBeVisible()
  })

  it('shows missing data without inventing a zero FPS sample', async () => {
    const screen = await render(FpsHistory, {
      props: { samples: [], startedAt: 1000, stoppedAt: 1000 },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    await expect.element(screen.getByText('No FPS samples. Enable FPS to collect samples.', { exact: true })).toBeVisible()
    expect(screen.getByRole('img').element().querySelector('polyline')?.getAttribute('points')).toBe('')
    await expect.element(screen.getByText('Latest', { exact: false })).not.toBeInTheDocument()
  })
})
