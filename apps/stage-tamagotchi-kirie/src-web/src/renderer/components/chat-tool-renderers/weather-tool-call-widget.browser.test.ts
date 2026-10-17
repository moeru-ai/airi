import type { WeatherReport } from '../../stores/tools/builtin/weather'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import WeatherToolCallWidget from './weather-tool-call-widget.vue'

const report: WeatherReport = {
  location: { city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
  current: {
    label: 'Now',
    condition: 'Clear sky',
    conditionCode: 'clear-day',
    isNight: false,
    temperature: '21°C',
    feelsLike: '20°C',
    humidity: '60%',
    wind: '11 km/h',
    precipitation: '10%',
    high: '24°C',
    low: '18°C',
  },
  daily: [{
    label: 'Today',
    date: '2026-10-17',
    condition: 'Rain',
    conditionCode: 'rain',
    isNight: false,
    temperature: '24°C',
    high: '24°C',
    low: '18°C',
    wind: '20 km/h',
    precipitation: '70%',
  }],
}

describe('weather forecast drawers', () => {
  it('opens a forecast day and closes the current weather', async () => {
    const screen = await render(WeatherToolCallWidget, {
      props: { report },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })] },
    })
    const now = screen.getByRole('button', { name: /now/ })
    const today = screen.getByRole('button', { name: /today/ })
    await expect.element(now).toHaveAttribute('aria-expanded', 'true')
    await expect.element(today).toHaveAttribute('aria-expanded', 'false')
    await today.click()
    await expect.element(now).toHaveAttribute('aria-expanded', 'false')
    await expect.element(today).toHaveAttribute('aria-expanded', 'true')
    await expect.element(screen.getByText('70%')).toBeVisible()
    await today.click()
    await expect.element(today).toHaveAttribute('aria-expanded', 'false')
  })
})
