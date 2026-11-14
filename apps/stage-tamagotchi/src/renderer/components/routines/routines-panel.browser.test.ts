import type { RoutineClient, RoutineView } from '@proj-airi/stage-ui/libs/routines/contracts'
import type { Routine } from '@proj-airi/stage-ui/libs/routines/model'

import messages from '@proj-airi/i18n/locales'
import en from '@proj-airi/i18n/locales/en'

import { importMaru } from '@proj-airi/stage-ui/libs/routines/maru'
import { emptyState } from '@proj-airi/stage-ui/libs/routines/model'
import { querySchedule } from '@proj-airi/stage-ui/libs/routines/schedule'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createApp, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import RoutinesPanel from './routines-panel.vue'

import 'virtual:uno.css'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.useRealTimers()
})

async function mount(routine?: Routine) {
  const state = emptyState()
  state.routine = routine ?? null
  const view: RoutineView = { storageError: null, state, schedule: querySchedule(state, Date.now()), proposals: [] }
  const client: RoutineClient = {
    read: vi.fn(async () => structuredClone(view)),
    apply: vi.fn(async (command) => {
      if (command.kind === 'save') {
        state.routine = command.routine
        state.revision++
      }
      return state
    }),
    confirm: vi.fn(async () => state),
  }
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(RoutinesPanel, { client })
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages })
  app.use(i18n)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await vi.waitFor(() => expect(client.read).toHaveBeenCalled())
  await nextTick()
  return { host, client, state, i18n }
}
function button(host: HTMLElement, key: string) {
  const result = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === en.routines[key as keyof typeof en.routines])
  if (!result)
    throw new Error(`missing button: ${key}`)
  return result
}

it('previews Japanese activities and the short sleep warning without writing or activating', async () => {
  const { host, client } = await mount()
  const code = 'eyJ2IjoxLCJ0IjoiIiwicyI6IiIsImMiOjIsImUiOltbIuedoeecoCIsMTIwLDI1NSwwXSxbIumjn-S6iyIsMjU1LDUyNSw1XSxbIuenu-WLlSIsNTI1LDU1NSwxMV0sWyLku5XkuosiLDU1NSw3MzUsMV0sWyLpo5_kuosiLDczNSw3ODAsNV0sWyLku5XkuosiLDc4MCwxMTEwLDFdLFsi6aOf5LqLIiwxMTEwLDExNTUsNV0sWyLku5XkuosiLDExNTUsMTI2MCwxXSxbIui2o-WRsyIsMTI2MCwxMzgwLDddLFsi5YWl5rW0IiwxMzgwLDE0MTAsMl0sWyLotqPlkbMiLDE0MTAsMTIwLDddXX0='
  const source = host.querySelector<HTMLInputElement>('[data-testid="maru-url"]')!
  source.value = `https://kxn4t.github.io/maru-ichinichi/#d=${code}`
  source.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  button(host, 'preview').click()
  await nextTick()
  expect(host.textContent).toContain(en.routines.shortSleep)
  expect(host.querySelector<HTMLInputElement>('[data-testid="activity-label"]')?.value).toBe('睡眠')
  expect(host.querySelector<HTMLInputElement>('[data-testid="activity-start"]')?.value).toBe('02:00')
  expect(client.apply).not.toHaveBeenCalled()
  expect(host.textContent).toContain('2h 15m')
  await page.viewport(1000, 850)
  await page.screenshot({ element: host, path: './__screenshots__/maru-preview.png' })
  await vi.waitFor(() => expect(button(host, 'save').disabled).toBe(false))
  button(host, 'save').click()
  await vi.waitFor(() => expect(client.apply).toHaveBeenCalledTimes(1))
  const call = vi.mocked(client.apply).mock.calls[0][0]
  expect(call.kind).toBe('save')
  if (call.kind === 'save') {
    expect(call.routine.enabled).toBe(false)
    expect(call.routine.remindersEnabled).toBe(false)
    expect(call.routine.reviewed).toBe(false)
    expect(call.routine.activities).toHaveLength(11)
    expect(call.routine.activities.at(-1)?.end).toBe(120)
  }
  await vi.waitFor(() => expect(button(host, 'edit').disabled).toBe(false))
  button(host, 'edit').click()
  await nextTick()
  expect(host.querySelector<HTMLInputElement>('[data-testid="activity-label"]')?.value).toBe('睡眠')
})

it('rejects hostile input before it reaches persistence', async () => {
  const { host, client } = await mount()
  const source = host.querySelector<HTMLInputElement>('[data-testid="maru-url"]')!
  source.value = 'javascript:alert(1)'
  source.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  button(host, 'preview').click()
  await nextTick()
  expect(host.querySelector('[role="alert"]')).not.toBeNull()
  expect(client.apply).not.toHaveBeenCalled()
})

it('keeps the edit revision when another window updates the routine', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const { host, client, state } = await mount()
  button(host, 'create').click()
  await nextTick()
  await vi.waitFor(() => expect(button(host, 'save').disabled).toBe(false))
  button(host, 'save').click()
  await vi.waitFor(() => expect(button(host, 'edit').disabled).toBe(false))
  button(host, 'edit').click()
  await nextTick()
  state.revision = 2
  await vi.advanceTimersByTimeAsync(10000)
  await nextTick()
  button(host, 'save').click()
  await vi.waitFor(() => expect(client.apply).toHaveBeenCalledTimes(2))
  expect(vi.mocked(client.apply).mock.calls[1][0].expectedRevision).toBe(1)
  vi.useRealTimers()
})

it('requires a fresh settings revision after another window changes the plan', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const { host, client, state } = await mount()
  button(host, 'create').click()
  await nextTick()
  button(host, 'save').click()
  await vi.waitFor(() => expect(button(host, 'applySettings').disabled).toBe(false))
  state.revision = 2
  await vi.advanceTimersByTimeAsync(10000)
  await nextTick()
  button(host, 'applySettings').click()
  await vi.waitFor(() => expect(client.apply).toHaveBeenCalledTimes(2))
  expect(vi.mocked(client.apply).mock.calls[1][0].expectedRevision).toBe(1)
})

it('shows sleep per weekday rather than adding unrelated weekdays together', async () => {
  const code = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ v: 1, t: '', s: '', c: 2, e: [['睡眠', 120, 360, 0], ['sono', 840, 1080, 1]] }))))
  const routine = importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${code}`, 'UTC')
  routine.activities[0].days = [1]
  routine.activities[1].days = [2]
  const { host } = await mount(routine)
  expect(host.textContent).toContain('4h 0m')
  expect(host.textContent).not.toContain('8h 0m')
})

it('edits a displayed translation explicitly without changing the original source or granting activation', async () => {
  const routine = { id: 'custom', title: 'Fictitious', subtitle: '', timeZone: 'America/Sao_Paulo', reviewed: false, shortSleepAcknowledged: false, enabled: false, remindersEnabled: false, advanceMinutes: 15, pausedUntil: 0, activities: [{ id: 'stable', label: 'custom study', category: 'other' as const, start: 600, end: 660, color: '#abcdef', days: [1] }] }
  const { host, client, state, i18n } = await mount(routine)
  button(host, 'edit').click()
  await nextTick()
  i18n.global.locale.value = 'fr'
  await nextTick()
  const displayed = host.querySelector<HTMLInputElement>('[data-testid="activity-display-label"]')!
  expect(displayed).not.toBeNull()
  displayed.value = 'Étude personnalisée'
  displayed.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(state.routine?.activities[0].label).toBe('custom study')
  expect(client.apply).not.toHaveBeenCalled()
  const save = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === messages.en.routines.save)!
  save.click()
  await vi.waitFor(() => expect(client.apply).toHaveBeenCalledOnce())
  expect(vi.mocked(client.apply).mock.calls[0][0]).toMatchObject({ kind: 'save', routine: { enabled: false, remindersEnabled: false, activities: [{ id: 'stable', label: 'custom study', displayLabels: { fr: 'Étude personnalisée' } }] } })
})
