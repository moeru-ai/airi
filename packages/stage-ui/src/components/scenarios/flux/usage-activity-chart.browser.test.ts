import type { DailyUsage } from './usage-stats'

import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import UsageActivityChart from './usage-activity-chart.vue'

import 'virtual:uno.css'

function createDays(): DailyUsage[] {
  const days = Array.from({ length: 365 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 25) - (364 - index) * 86_400_000).toISOString().slice(0, 10),
    microFlux: index >= 362 ? (index - 361) * 1_000_000 + 250_000 : 0,
  }))
  days[357]!.microFlux = 10_000_000
  return days
}

function renderChart() {
  return render(UsageActivityChart, {
    props: { days: createDays() },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

afterEach(cleanup)

describe('flux activity chart', () => {
  it('shows daily, weekly, and cumulative amounts through pointer and keyboard input', async () => {
    await page.viewport(1100, 700)
    const screen = await renderChart()
    const daily = screen.getByRole('listbox', { name: 'Daily Flux usage' })
    const saturday = daily.getByRole('option', { name: 'Oct 24, 2026' })
    // https://github.com/moeru-ai/airi/pull/3173#discussion_r4574976396
    // Pointer focus previously replaced the selected day with the last day.
    await saturday.click()
    await expect.element(screen.getByRole('status')).toHaveTextContent('2.25 Flux')
    await daily.getByRole('option', { name: 'Oct 25, 2026' }).hover()
    await expect.element(screen.getByRole('status')).toHaveTextContent('3.25 Flux')
    await userEvent.keyboard('{ArrowUp}')
    await expect.element(saturday).toHaveAttribute('aria-selected', 'true')
    await expect.element(screen.getByRole('status')).toHaveTextContent('2.25 Flux')
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(daily.getByRole('option', { name: 'Oct 17, 2026' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(screen.getByRole('status')).toHaveTextContent('10 Flux')

    await screen.getByRole('button', { name: 'Weekly', exact: true }).click()
    expect(screen.getByRole('status').elements()).toHaveLength(0)
    await expect.element(screen.getByRole('button', { name: 'Weekly', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(screen.getByRole('status')).toHaveTextContent('6.75 Flux')

    await screen.getByRole('button', { name: 'Cumulative', exact: true }).click()
    await userEvent.tab()
    await expect.element(screen.getByRole('status')).toHaveTextContent('16.75 Flux')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('status').elements()).toHaveLength(0)
  })

  it('keeps the chart readable in a narrow scroll container', async () => {
    const screen = await renderChart()
    const root = screen.container.firstElementChild as HTMLElement
    root.style.width = '390px'
    const chart = screen.getByRole('group', { name: 'Flux activity for the last 365 days' }).element()
    const scroller = chart.parentElement!
    await expect.poll(() => scroller.scrollWidth > scroller.clientWidth).toBe(true)
    expect(root.scrollWidth).toBeLessThanOrEqual(390)
  })
})
