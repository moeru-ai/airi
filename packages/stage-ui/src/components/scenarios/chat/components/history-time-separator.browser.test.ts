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

it.each([
  ['en-US', 'yesterday 02:05 PM'],
  ['de', 'gestern 14:05'],
  ['ja', '昨日 14:05'],
  ['zh-Hant', '昨天 下午02:05'],
])('localizes relative labels with %s', async (locale, expected) => {
  const screen = await render(HistoryTimeSeparator, {
    props: { timestamp: new Date(2026, 9, 5, 14, 5).getTime(), now: new Date(2026, 9, 6, 17).getTime() },
    global: { plugins: [createI18nPlugin(locale)] },
  })
  expect(screen.container.querySelector('time')?.textContent).toBe(expected)
})

it('updates readable and full dates when the interface language changes', async () => {
  const i18n = createI18nPlugin('zh-Hans')
  const screen = await render(HistoryTimeSeparator, {
    props: { timestamp: new Date(2026, 9, 5, 14, 5).getTime(), now: new Date(2026, 9, 6, 17).getTime() },
    global: { plugins: [i18n] },
  })
  const button = screen.getByRole('button')
  await expect.element(button).toHaveTextContent('昨天 14:05')
  i18n.global.locale.value = 'en-US'
  await expect.element(button).toHaveTextContent('yesterday 02:05 PM')
  await button.click()
  await expect.element(button).toHaveTextContent('Oct 5, 2026, 2:05 PM')
  i18n.global.locale.value = 'zh-Hans'
  await expect.element(button).toHaveTextContent('2026年10月5日 14:05')
})
