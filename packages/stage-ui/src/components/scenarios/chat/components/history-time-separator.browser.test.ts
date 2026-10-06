import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import HistoryTimeSeparator from './history-time-separator.vue'

function createI18nPlugin(locale = 'zh-Hans') {
  return createI18n({ legacy: false, locale, messages: {} })
}

it.each([
  [new Date(2026, 9, 6, 14, 5), '14:05'],
  [new Date(2026, 9, 5, 14, 5), '昨天 14:05'],
  [new Date(2026, 9, 4, 14, 5), '前天 14:05'],
  [new Date(2026, 9, 3, 14, 5), '10月3日 14:05'],
  [new Date(2025, 9, 3, 14, 5), '2025年10月3日 14:05'],
])('shows a readable label for %s', async (timestamp, expected) => {
  const screen = await render(HistoryTimeSeparator, {
    props: { timestamp: timestamp.getTime(), now: new Date(2026, 9, 6, 17).getTime() },
    global: { plugins: [createI18nPlugin()] },
  })
  expect(screen.container.querySelector('time')?.textContent).toBe(expected)
  expect(screen.container.querySelector('time')?.dateTime).toBe(timestamp.toISOString())
})

it('toggles the full date with click and keyboard', async () => {
  const timestamp = new Date(2026, 9, 6, 14, 5).getTime()
  const screen = await render(HistoryTimeSeparator, {
    props: { timestamp, now: timestamp },
    global: { plugins: [createI18nPlugin()] },
  })
  const button = screen.getByRole('button')
  await button.click()
  expect(screen.container.querySelector('time')?.textContent).toBe('2026年10月6日 14:05')
  await expect.element(button).toHaveAttribute('aria-pressed', 'true')
  await userEvent.keyboard('{Enter}')
  expect(screen.container.querySelector('time')?.textContent).toBe('14:05')
  await expect.element(button).toHaveAttribute('aria-pressed', 'false')
})

it('uses calendar days across midnight and the year boundary', async () => {
  const timestamp = new Date(2025, 11, 31, 23, 59).getTime()
  const screen = await render(HistoryTimeSeparator, {
    props: { timestamp, now: timestamp },
    global: { plugins: [createI18nPlugin()] },
  })
  expect(screen.container.querySelector('time')?.textContent).toBe('23:59')
  await screen.rerender({ now: new Date(2026, 0, 1, 0, 1).getTime() })
  expect(screen.container.querySelector('time')?.textContent).toBe('昨天 23:59')
  await screen.rerender({ now: new Date(2026, 0, 2, 0, 1).getTime() })
  expect(screen.container.querySelector('time')?.textContent).toBe('前天 23:59')
  await screen.rerender({ now: new Date(2026, 0, 3, 0, 1).getTime() })
  expect(screen.container.querySelector('time')?.textContent).toBe('2025年12月31日 23:59')
})

it('localizes relative labels with the interface locale', async () => {
  const screen = await render(HistoryTimeSeparator, {
    props: { timestamp: new Date(2026, 9, 5, 14, 5).getTime(), now: new Date(2026, 9, 6, 17).getTime() },
    global: { plugins: [createI18nPlugin('en-US')] },
  })
  expect(screen.container.querySelector('time')?.textContent).toBe('yesterday 02:05 PM')
})
