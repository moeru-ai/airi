import type { DailyUsage, DailyUsageSummary } from '@proj-airi/api-server/types/flux-usage'

import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import UsageOverview from './usage-overview.vue'

import 'virtual:uno.css'

function createDays(): DailyUsage[] {
  return Array.from({ length: 365 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 25) - (364 - index) * 86_400_000).toISOString().slice(0, 10),
    microFlux: index >= 362 ? (index - 361) * 1_000_000 : 0,
  }))
}

function renderOverview(summary: DailyUsageSummary = { days: createDays(), longestSessionMs: 90 * 60_000 }) {
  return render(UsageOverview, {
    props: { summary },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

afterEach(cleanup)

describe('flux usage overview', () => {
  it('shows five summaries and switches the same tiles through three views', async () => {
    const screen = await renderOverview()
    await expect.element(screen.getByText('Peak daily Flux')).toBeVisible()
    await expect.element(screen.getByText('Longest session')).toBeVisible()
    await expect.element(screen.getByText('Longest streak')).toBeVisible()
    await expect.element(screen.getByText('Current streak')).toBeVisible()
    await expect.element(screen.getByText('Flux used')).toBeVisible()
    await expect.element(screen.getByRole('img', { name: 'Daily Flux usage' })).toBeVisible()
    const firstTile = screen.container.querySelector('.activity-tile')

    await screen.getByRole('button', { name: 'Weekly', exact: true }).click()
    await expect.element(screen.getByRole('img', { name: 'Weekly Flux usage' })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Weekly', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.container.querySelector('.activity-tile')).toBe(firstTile)

    await screen.getByRole('button', { name: 'Cumulative', exact: true }).click()
    await expect.element(screen.getByRole('img', { name: 'Cumulative Flux usage' })).toBeVisible()
    expect(screen.container.querySelector('.activity-tile')).toBe(firstTile)
  })

  it('shows exact daily, weekly, and cumulative values with keyboard navigation', async () => {
    const screen = await renderOverview()
    const chart = screen.getByRole('group', { name: 'Flux activity for the last 365 days' }).element() as HTMLElement
    chart.focus()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Oct 25, 2026')
    await expect.element(screen.getByRole('status')).toHaveTextContent('3 Flux')
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(screen.getByRole('status')).toHaveTextContent('Oct 24, 2026')
    await expect.element(screen.getByRole('status')).toHaveTextContent('2 Flux')

    await screen.getByRole('button', { name: 'Weekly', exact: true }).click()
    chart.focus()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Oct 19, 2026 – Oct 25, 2026')
    await expect.element(screen.getByRole('status')).toHaveTextContent('6 Flux')

    await screen.getByRole('button', { name: 'Cumulative', exact: true }).click()
    chart.focus()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Through Oct 25, 2026')
    await expect.element(screen.getByRole('status')).toHaveTextContent('6 Flux')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('status').elements()).toHaveLength(0)
  })

  it('shows hovered values and clears stale details on mode changes', async () => {
    const screen = await renderOverview()
    const svg = screen.getByRole('img', { name: 'Daily Flux usage' }).element()
    const target = svg.querySelectorAll('rect.fill-transparent')
    target[target.length - 1]!.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    await expect.element(screen.getByRole('status')).toHaveTextContent('3 Flux')
    await screen.getByRole('button', { name: 'Weekly', exact: true }).click()
    expect(screen.getByRole('status').elements()).toHaveLength(0)
  })

  it('keeps the chart readable in a narrow scroll container', async () => {
    const screen = await renderOverview()
    const root = screen.container.firstElementChild as HTMLElement
    root.style.width = '390px'
    const chart = screen.getByRole('group', { name: 'Flux activity for the last 365 days' }).element() as HTMLElement
    const scroller = chart.parentElement!
    await expect.poll(() => scroller.scrollWidth > scroller.clientWidth).toBe(true)
    expect(root.scrollWidth).toBeLessThanOrEqual(390)
    chart.focus()
    await userEvent.keyboard('{Home}')
    await expect.element(screen.getByRole('status')).toHaveTextContent('Oct 26, 2025')
    await userEvent.keyboard('{End}')
    await expect.element(screen.getByRole('status')).toHaveTextContent('Oct 25, 2026')
  })

  it('shows the empty hint only when both usage and session duration are zero', async () => {
    const screen = await renderOverview({ days: createDays().map(day => ({ ...day, microFlux: 0 })), longestSessionMs: 0 })
    await expect.element(screen.getByText('No usage yet.')).toBeVisible()
    expect(screen.getByRole('img').elements()).toHaveLength(0)
  })

  it('preserves session information when requests incurred no fee', async () => {
    const screen = await renderOverview({ days: createDays().map(day => ({ ...day, microFlux: 0 })), longestSessionMs: 60_000 })
    await expect.element(screen.getByText('1m', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('img', { name: 'Daily Flux usage' })).toBeVisible()
  })
})
