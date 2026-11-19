import messages from '@proj-airi/i18n/locales'

import { all } from '@proj-airi/i18n'
import { emptyState } from '@proj-airi/stage-ui/libs/routines/model'
import { querySchedule } from '@proj-airi/stage-ui/libs/routines/schedule'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createApp, h, nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

import RoutineCard from './routine-card.vue'

import { projectRoutineWidget } from '../../../shared/routine-widgets'
import { routineWidgetComponents } from './index'

import 'virtual:uno.css'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.useRealTimers()
})
const now = Date.parse('2026-10-22T04:00:00Z')
function data(mode: 'next' | 'day' = 'day') {
  const state = emptyState()
  state.routine = { id: 'test', title: 'Agenda fictícia', subtitle: '', timeZone: 'America/Sao_Paulo', reviewed: false, enabled: false, remindersEnabled: false, shortSleepAcknowledged: false, advanceMinutes: 15, pausedUntil: now + 3600000, activities: [
    { id: 'night', label: '趣味', category: 'other', color: '#12ab34', start: 1410, end: 120, days: [3] },
    { id: 'sleep', label: '睡眠', category: 'sleep', color: '#abcdef', start: 120, end: 480, days: [4] },
    { id: 'long', label: 'Estudo fictício com nome longo em português e 日本語', category: 'other', color: '#ff8800', start: 600, end: 660, days: [4] },
  ] }
  state.completions.push({ activityId: 'night', date: '2026-10-21', completedAt: now - 1000 })
  state.overrides.push({ activityId: 'sleep', date: '2026-10-22', start: 180, end: 540 })
  return projectRoutineWidget({ state, schedule: querySchedule(state, now) }, mode, now)
}
async function mount(value: unknown, fakeIntervals = false) {
  vi.useFakeTimers({ toFake: fakeIntervals ? ['Date', 'setInterval', 'clearInterval'] : ['Date'] })
  vi.setSystemTime(now)
  const host = document.createElement('div')
  host.style.cssText = 'width:420px;height:640px'
  document.body.append(host)
  const props = reactive({ data: value })
  const app = createApp({ render: () => h(RoutineCard, { data: props.data, title: 'routine-agenda' }) })
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages })
  app.use(i18n)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  return { host, props, i18n }
}
it('registers both cards with the existing widget registry', async () => {
  expect(Object.keys(routineWidgetComponents)).toEqual(['routine-next', 'routine-agenda'])
  expect(routineWidgetComponents['routine-next']).toBeDefined()
})
it('renders compact local times, countdown, category, and the following activity', async () => {
  const { host } = await mount(data('next'))
  expect(host.querySelector('[data-testid="routine-widget"]')?.hasAttribute('title')).toBe(false)
  expect(host.textContent).toContain('Sleep')
  expect(host.textContent).toContain('03:00')
  expect(host.textContent).toContain('09:00')
  expect(host.textContent).toContain('120')
  expect(host.textContent).toContain('Sleep')
  expect(host.textContent).toContain('Estudo fictício')
  expect(host.querySelector('[data-activity-id="sleep"]')).not.toBeNull()
})
it('renders carry-in, completed status, overrides, paused/disabled indicators and a 24-hour clock', async () => {
  const { host } = await mount(data())
  expect(host.textContent).toContain('Hobby')
  expect(host.textContent).toContain('Completed')
  expect(host.textContent).toContain('Changed for this date')
  expect(host.textContent).toContain('Paused')
  expect(host.textContent).toContain('Inactive')
  expect(host.textContent).toContain('America/Sao_Paulo')
  const toggle = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Clock'))!
  toggle.click()
  await nextTick()
  expect(host.querySelector('svg')).not.toBeNull()
  expect(Number(getComputedStyle(host.querySelector('svg path')!).opacity)).toBeGreaterThan(0.3)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    expect(getComputedStyle(host.querySelector('svg path')!).animationName).toBe('none')
  }
  else {
    expect(getComputedStyle(host.querySelector('svg path')!).animationName).toContain('routine-draw')
  }
  expect(getComputedStyle(host.querySelector('svg text')!).fontSize).toBe('11px')
  expect(host.querySelectorAll('[data-clock-activity]')).toHaveLength(3)
  expect(host.textContent).toContain('Estudo fictício com nome longo')
  expect(host.querySelector('input')).toBeNull()
})
it('renders empty and invalid snapshots safely, then updates without keeping stale entries', async () => {
  const { host, props } = await mount(data())
  props.data = { ...data(), events: [{ label: '<img src=x onerror=alert(1)>' }] }
  await nextTick()
  expect(host.textContent).toContain('unavailable')
  await page.screenshot({ element: host, path: './__screenshots__/routine-invalid.png' })
  expect(host.querySelector('img')).toBeNull()
  expect(host.textContent).not.toContain('趣味')
  const state = emptyState()
  props.data = projectRoutineWidget({ state, schedule: querySchedule(state, now) }, 'day', now)
  await nextTick()
  expect(host.textContent).toContain('No routine saved')
})

it('animates distinct minute and second hands only while the clock is open, then releases its timers', async () => {
  const { host } = await mount(data(), true)
  const toggle = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Clock'))!
  toggle.click()
  await nextTick()
  const minute = host.querySelector<SVGGElement>('[data-clock-hand="minute"]')!
  const second = host.querySelector<SVGGElement>('[data-clock-hand="second"]')!
  expect(minute).not.toBeNull()
  expect(second).not.toBeNull()
  const minuteBefore = minute.getAttribute('style')
  const secondBefore = second.getAttribute('style')
  await vi.advanceTimersByTimeAsync(1000)
  await nextTick()
  expect(minute.getAttribute('style')).not.toBe(minuteBefore)
  expect(second.getAttribute('style')).not.toBe(secondBefore)
  expect(host.textContent).toContain('Seconds')
  const activeTimers = vi.getTimerCount()
  toggle.click()
  await nextTick()
  expect(vi.getTimerCount()).toBeLessThan(activeTimers)
  cleanups.splice(0).forEach(cleanup => cleanup())
  expect(vi.getTimerCount()).toBe(0)
})

it.each(Object.keys(all))('switches a live card to %s without altering its source, identity, or time zone', async (locale) => {
  const payload = data()
  const before = JSON.stringify(payload)
  const { host, i18n } = await mount(payload)
  const original = host.querySelector('[data-testid="routine-widget"]')
  i18n.global.locale.value = locale as keyof typeof messages
  await nextTick()
  for (const key of ['widgets.agenda', 'labels.sleep', 'labels.hobby', 'widgets.paused', 'widgets.inactive', 'widgets.completed'])
    expect(host.textContent).toContain(i18n.global.t(`routines.${key}`))
  expect(host.textContent).toContain('Estudo fictício com nome longo')
  expect(host.textContent).toContain(new Intl.DateTimeFormat(locale, { timeZone: 'UTC', dateStyle: 'full' }).format(Date.parse('2026-10-22T12:00Z')))
  expect(host.querySelector('[data-activity-id="sleep"]')?.getAttribute('data-source-label')).toBe('睡眠')
  expect(host.querySelector('[data-testid="routine-widget"]')).toBe(original)
  expect(original?.getAttribute('lang')).toBe(locale)
  expect(JSON.stringify(payload)).toBe(before)
})
