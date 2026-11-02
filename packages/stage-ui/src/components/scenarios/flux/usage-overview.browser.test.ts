import type { DailyUsage, DailyUsageSummary } from './usage-stats'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import UsageOverview from './usage-overview.vue'

const DAY_COUNT = 365
const LAST_DAY_MS = Date.UTC(2026, 9, 25)

function createDays(usedDays: Record<number, Partial<DailyUsage>>): DailyUsage[] {
  return Array.from({ length: DAY_COUNT }, (_, index) => {
    const daysBeforeLast = DAY_COUNT - 1 - index
    return {
      date: new Date(LAST_DAY_MS - daysBeforeLast * 86_400_000).toISOString().slice(0, 10),
      llmMicroFlux: 0,
      ttsMicroFlux: 0,
      newSessionCount: 0,
      ...usedDays[daysBeforeLast],
    }
  })
}

function scrollingAncestor(element: Element): HTMLElement {
  let current = element.parentElement
  while (current) {
    if (current.classList.contains('overflow-x-auto'))
      return current
    current = current.parentElement
  }
  throw new Error('The charts have no horizontal scroller')
}

function sameChartWidth(...charts: Element[]): boolean {
  const widths = charts.map(chart => Math.round(chart.getBoundingClientRect().width))
  return widths.every(width => width === widths[0])
}

function renderOverview(summary: DailyUsageSummary) {
  return render(UsageOverview, {
    props: { summary },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('flux usage overview', () => {
  it('shows the summary cards and the three charts', async () => {
    const screen = await renderOverview({
      days: createDays({
        0: { llmMicroFlux: 2_000_000, ttsMicroFlux: 500_000, newSessionCount: 2 },
        1: { llmMicroFlux: 1_000_000, newSessionCount: 1 },
        5: { llmMicroFlux: 3_000_000, newSessionCount: 4 },
        6: { llmMicroFlux: 1_000_000, newSessionCount: 1 },
        7: { llmMicroFlux: 1_000_000, newSessionCount: 1 },
      }),
      longestSessionMs: 90 * 60_000,
    })

    await expect.element(screen.getByText('Longest session')).toBeVisible()
    await expect.element(screen.getByText('Sessions', { exact: true })).toBeVisible()
    expect(screen.getByText('Flux used', { exact: true }).elements()).toHaveLength(2)
    await expect.element(screen.getByText('Longest streak')).toBeVisible()
    await expect.element(screen.getByText('Current streak')).toBeVisible()
    await expect.element(screen.getByText('3d', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('2d', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('New sessions', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('img', { name: 'Flux used on each day of this year' })).toBeVisible()
  })

  it('scrolls the three charts together when the page is narrower than 768px', async () => {
    const screen = await renderOverview({
      days: createDays({
        0: { llmMicroFlux: 2_000_000, ttsMicroFlux: 500_000, newSessionCount: 2 },
        1: { llmMicroFlux: 1_000_000, newSessionCount: 1 },
      }),
      longestSessionMs: 90 * 60_000,
    })

    const heatmapLocator = screen.getByRole('img', { name: 'Flux used on each day of this year' })
    const areaLocator = screen.getByRole('img', { name: 'Flux used', exact: true })
    const sessionLocator = screen.getByRole('img', { name: 'New sessions', exact: true })
    await expect.element(heatmapLocator).toBeVisible()
    await expect.element(areaLocator).toBeVisible()
    await expect.element(sessionLocator).toBeVisible()
    const heatmap = heatmapLocator.element()
    const area = areaLocator.element()
    const sessions = sessionLocator.element()
    const scroller = scrollingAncestor(heatmap)
    const root = screen.container.firstElementChild as HTMLElement

    root.style.width = '400px'
    await expect.poll(() => sameChartWidth(heatmap, area, sessions) && scroller.scrollWidth > scroller.clientWidth).toBe(true)

    root.style.width = '800px'
    await expect.poll(() => sameChartWidth(heatmap, area, sessions) && scroller.scrollWidth === scroller.clientWidth).toBe(true)
  })

  it('shows only the empty hint when no Flux was used', async () => {
    const screen = await renderOverview({ days: createDays({}), longestSessionMs: 0 })

    await expect.element(screen.getByText('No usage yet.')).toBeVisible()
    expect(screen.getByText('Longest session').elements()).toHaveLength(0)
    expect(screen.getByRole('img').elements()).toHaveLength(0)
  })
})
