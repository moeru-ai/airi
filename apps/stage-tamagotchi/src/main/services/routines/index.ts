import type { EventContext } from '@moeru/eventa'

import type { RoutineWidgetsManager } from './widgets'

import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { all, resolveSupportedLocale } from '@proj-airi/i18n'
import { commandSchema } from '@proj-airi/stage-ui/libs/routines/contracts'
import { describeActivityLabel } from '@proj-airi/stage-ui/libs/routines/labels'
import { minutesToTime } from '@proj-airi/stage-ui/libs/routines/maru'
import { app, dialog, Notification, powerMonitor } from 'electron'

import * as v from 'valibot'

import { routinesApply, routinesConfirm, routinesPropose, routinesQuery, routinesRead } from '../../../shared/eventa/routines'
import { routineWidgetModeSchema } from '../../../shared/routine-widgets'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { RoutineRuntime } from './runtime'
import { RoutineWidgets } from './widgets'

/**
 * Registers the single profile-owned writer. Timers exist only for an explicitly enabled reminder configuration.
 * Shutdown removes the resume listener and timer. No service runs after the Electron process exits.
 */
export function setupRoutines<Extensions, Options extends { raw?: unknown }>(context: EventContext<Extensions, Options>, translate: (key: string) => string, widgetsManager: RoutineWidgetsManager, getLocale: () => string) {
  const runtime = new RoutineRuntime(join(app.getPath('userData'), 'routines'))
  const ready = runtime.load()
  const widgets = new RoutineWidgets(runtime, widgetsManager)
  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false
  const tt = (key: string) => translate(`routines.${key}`)
  const locale = () => resolveSupportedLocale(getLocale(), Object.keys(all))
  const number = (value: number) => new Intl.NumberFormat(locale()).format(value)
  const boolean = (value: boolean) => tt(value ? 'yes' : 'no')
  const date = (key: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', dateStyle: 'full' }).format(Date.parse(`${key}T12:00Z`))

  async function tick() {
    await ready
    if (stopped || !Notification.isSupported())
      return
    const { state } = await runtime.read()
    await runtime.tick(Date.now(), (occurrence) => {
      const activity = state.routine?.activities.find(activity => activity.id === occurrence.activityId)
      const notification = new Notification({
        title: activity ? describeActivityLabel(activity, locale(), translate).displayLabel : occurrence.label,
        body: new Intl.DateTimeFormat(locale(), { timeZone: state.routine?.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(occurrence.startAt),
        silent: true,
      })
      notification.show()
    })
  }
  function onTick() {
    void tick().catch(error => console.warn('[routines] Reminder attempt failed:', error))
  }
  async function updateTimer() {
    await ready
    if (stopped)
      return
    const { state } = await runtime.read()
    const enabled = state.routine?.enabled && state.routine.remindersEnabled && Notification.isSupported()
    if (enabled && !timer) {
      timer = setInterval(onTick, 15000)
      timer.unref()
      onTick()
    }
    else if (!enabled && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
  async function approve(detail: string) {
    const response = await dialog.showMessageBox({
      type: 'question',
      title: tt('confirmTitle'),
      message: tt('confirmDetail'),
      detail,
      buttons: [tt('confirmAction'), tt('cancelAction')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })
    if (response.response !== 0)
      throw new Error('user-cancelled')
  }
  defineInvokeHandler(context, routinesQuery, async (input) => {
    const request = v.parse(v.strictObject({ view: routineWidgetModeSchema }), input)
    await ready
    return { ...await widgets.query(request.view), locale: locale() }
  })
  defineInvokeHandler(context, routinesRead, async () => {
    await ready
    return runtime.read()
  })
  defineInvokeHandler(context, routinesApply, async (input) => {
    await ready
    const command = v.parse(commandSchema, input)
    if (command.kind === 'configure' && command.remindersEnabled && !Notification.isSupported())
      throw new Error(tt('notificationUnsupported'))
    const { state } = await runtime.read()
    let detail: string
    if (command.kind === 'save') {
      detail = `${tt('inactiveImport')}\n${tt('replacement')}\n${command.routine.title} · ${command.routine.timeZone}\n${command.routine.activities.map(activity => `${tt('sourceLabel')}: ${activity.label} · ${tt('displayLabel')}: ${describeActivityLabel(activity, locale(), translate).displayLabel}\n${Object.entries(activity.displayLabels ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ')}\n${minutesToTime(activity.start)}–${minutesToTime(activity.end)} · ${activity.days.map(day => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short' }).format(Date.UTC(2026, 0, 4 + day))).join(', ')} · ${activity.color}`).join('\n')}`
    }
    else if (command.kind === 'configure') {
      detail = `${state.routine?.title ?? ''} · ${state.routine?.timeZone ?? ''}\n${tt('enable')}: ${boolean(command.enabled)}\n${tt('enableReminders')}: ${boolean(command.remindersEnabled)}\n${tt('advance')}: ${number(command.advanceMinutes)}\n${tt('review')}: ${boolean(command.reviewed)}\n${tt('acknowledgeSleep')}: ${boolean(command.shortSleepAcknowledged)}`
    }
    else {
      detail = `${tt(command.kind === 'delete' ? 'delete' : 'paused')}: ${state.routine?.title ?? ''}`
      if (command.kind === 'pause')
        detail += `\n${command.until ? new Intl.DateTimeFormat(locale(), { timeZone: state.routine?.timeZone, dateStyle: 'full', timeStyle: 'short' }).format(command.until) : tt('resume')}`
    }
    await approve(detail)
    const saved = await runtime.apply(command)
    await updateTimer()
    await widgets.refresh()
    return saved
  })
  defineInvokeHandler(context, routinesPropose, async (input) => {
    await ready
    return runtime.propose(input)
  })
  defineInvokeHandler(context, routinesConfirm, async ({ id }) => {
    await ready
    v.parse(v.pipe(v.string(), v.uuid()), id)
    const proposal = (await runtime.read()).proposals.find(item => item.id === id)
    if (!proposal)
      throw new Error('expired-proposal')
    const { state } = await runtime.read()
    const change = proposal.change
    let detail = `${tt(change.kind)} · ${date(proposal.proposedDate)} · ${state.routine?.timeZone ?? ''}`
    if (change.kind !== 'mute-today') {
      const activity = state.routine?.activities.find(item => item.id === change.activityId)
      detail += `: ${activity ? describeActivityLabel(activity, locale(), translate).displayLabel : tt('activity')} · ${date(change.date)} · ${state.routine?.timeZone ?? ''}`
      if (change.kind === 'postpone') {
        const override = state.overrides.find(item => item.activityId === change.activityId && item.date === change.date)
        const previousStart = override?.start ?? activity?.start
        detail += `\n${previousStart === undefined ? '' : minutesToTime(previousStart)} → ${minutesToTime(change.start)}`
      }
    }
    await approve(detail)
    const saved = await runtime.confirm(id)
    await widgets.refresh()
    return saved
  })
  powerMonitor.on('resume', onTick)
  void updateTimer().catch(error => console.warn('[routines] Routine store unavailable:', error))
  onAppBeforeQuit(async () => {
    stopped = true
    clearInterval(timer)
    powerMonitor.removeListener('resume', onTick)
    await runtime.dispose()
  })
}
