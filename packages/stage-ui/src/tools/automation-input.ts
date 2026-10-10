import type { Automation, AutomationCondition, AutomationTrigger, Weekday } from '@proj-airi/core-agent'
import type { InferOutput } from 'valibot'

import { minutesOfDay } from '@proj-airi/core-agent'
import { array, description, maxLength, nullable, number, picklist, pipe, strictObject, string } from 'valibot'

// Strict function calling needs every property in `required`, so a value that does not apply is null.
// Some strict function calling rejects numeric bounds in the schema, so `automationFromInput` checks them.

export const triggerSchema = strictObject({
  source: pipe(picklist(['clock', 'chat', 'mouse', 'keyboard', 'module']), description('What the trigger follows.')),
  event: pipe(picklist(['at', 'every', 'message', 'idle', 'active', 'observation']), description('clock: at or every. chat: message or idle. mouse and keyboard: active or idle. module: observation.')),
  time: nullable(pipe(string(), maxLength(5), description('For clock at: the local time as HH:MM. Null otherwise.'))),
  days: nullable(pipe(array(number()), description('For clock at: weekdays from 0 (Sunday) to 6. Null or empty for every day.'))),
  minutes: nullable(pipe(number(), description('For clock every, and for an idle event: whole minutes from 1 to 10080. Null otherwise.'))),
  afterIdleMinutes: nullable(pipe(number(), description('For a mouse or keyboard active event: only the first use after this many idle minutes fires. Null for any use.'))),
  module: nullable(pipe(string(), maxLength(120), description('For module: the name of a registered module, for example minecraft. Null otherwise.'))),
})

export const conditionSchema = strictObject({
  kind: pipe(picklist(['time', 'weekday', 'state']), description('time: a local time range. weekday: some days of the week. state: whether a source was idle or active.')),
  from: nullable(pipe(string(), maxLength(5), description('For time: the start as HH:MM. Null otherwise.'))),
  to: nullable(pipe(string(), maxLength(5), description('For time: the end as HH:MM. A range that ends before it starts crosses midnight. Null otherwise.'))),
  days: nullable(pipe(array(number()), description('For weekday: weekdays from 0 (Sunday) to 6. Null otherwise.'))),
  source: nullable(pipe(picklist(['chat', 'mouse', 'keyboard']), description('For state: the source. Null otherwise.'))),
  state: nullable(pipe(picklist(['idle', 'active']), description('For state: idle means no use for at least the minutes, active means use within them. Null otherwise.'))),
  minutes: nullable(pipe(number(), description('For state: whole minutes from 1 to 10080. Null otherwise.'))),
})

/** The automation fields that a model fills: triggers, conditions, and a cooldown. */
export const automationInputSchema = strictObject({
  triggers: pipe(array(triggerSchema), description('Any trigger starts a check. At least one.')),
  conditions: pipe(array(conditionSchema), description('Every condition must hold when a trigger fires. Empty for none.')),
  cooldownMinutes: nullable(pipe(number(), description('The shortest time between two runs in whole minutes. Null for none.'))),
})

export type AutomationInput = InferOutput<typeof automationInputSchema>
export type TriggerInput = InferOutput<typeof triggerSchema>
export type ConditionInput = InferOutput<typeof conditionSchema>

function wholeMinutes(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 10_080
}

function weekdays(days: number[] | null): Weekday[] | string {
  const list = days ?? []
  return list.every(day => Number.isInteger(day) && day >= 0 && day <= 6) ? [...new Set(list)].sort() as Weekday[] : 'Weekdays run from 0 (Sunday) to 6.'
}

function triggerFrom(input: TriggerInput): AutomationTrigger | string {
  switch (input.source) {
    case 'clock': {
      if (input.event === 'every')
        return wholeMinutes(input.minutes) ? { source: 'clock', event: 'every', minutes: input.minutes } : 'A clock every trigger needs whole minutes from 1 to 10080.'
      if (input.event !== 'at' || minutesOfDay(input.time ?? '') === undefined)
        return 'A clock trigger is at an HH:MM time or every some minutes.'
      const days = weekdays(input.days)
      return typeof days === 'string' ? days : { source: 'clock', event: 'at', time: input.time!.trim(), ...(days.length ? { days } : {}) }
    }
    case 'chat':
      if (input.event === 'message')
        return { source: 'chat', event: 'message' }
      return input.event === 'idle' && wholeMinutes(input.minutes) ? { source: 'chat', event: 'idle', minutes: input.minutes } : 'A chat trigger is message, or idle with whole minutes.'
    case 'mouse':
    case 'keyboard':
      if (input.event === 'idle')
        return wholeMinutes(input.minutes) ? { source: input.source, event: 'idle', minutes: input.minutes } : 'An idle trigger needs whole minutes from 1 to 10080.'
      if (input.event !== 'active')
        return 'A mouse or keyboard trigger is active or idle.'
      if (input.afterIdleMinutes !== null && !wholeMinutes(input.afterIdleMinutes))
        return 'afterIdleMinutes must be whole minutes from 1 to 10080.'
      return { source: input.source, event: 'active', ...(input.afterIdleMinutes ? { afterIdleMinutes: input.afterIdleMinutes } : {}) }
    case 'module':
      return input.event === 'observation' && input.module?.trim() ? { source: 'module', event: 'observation', module: input.module.trim() } : 'A module trigger needs the module name.'
  }
}

function conditionFrom(input: ConditionInput): AutomationCondition | string {
  switch (input.kind) {
    case 'time':
      return minutesOfDay(input.from ?? '') !== undefined && minutesOfDay(input.to ?? '') !== undefined
        ? { kind: 'time', from: input.from!.trim(), to: input.to!.trim() }
        : 'A time condition needs from and to as HH:MM.'
    case 'weekday': {
      const days = weekdays(input.days)
      return typeof days === 'string' ? days : days.length ? { kind: 'weekday', days } : 'A weekday condition needs at least one day.'
    }
    case 'state':
      return input.source && input.state && wholeMinutes(input.minutes)
        ? { kind: 'state', source: input.source, state: input.state, minutes: input.minutes }
        : 'A state condition needs a source, idle or active, and whole minutes.'
  }
}

/**
 * Builds an automation from what a model or the recipe editor filled in.
 * Each trigger and condition reads only the fields of its source and event, so other fields can keep any value.
 *
 * Returns:
 * - The automation, or an error text that names what is missing, so the model can fix its call.
 */
export function automationFromInput(input: AutomationInput): Automation | string {
  if (!input.triggers.length)
    return 'An automation needs at least one trigger.'
  if (input.cooldownMinutes !== null && !wholeMinutes(input.cooldownMinutes))
    return 'cooldownMinutes must be whole minutes from 1 to 10080.'
  const triggers = input.triggers.map(triggerFrom)
  const conditions = input.conditions.map(conditionFrom)
  const error = [...triggers, ...conditions].find(entry => typeof entry === 'string')
  if (typeof error === 'string')
    return error
  return {
    triggers: triggers as AutomationTrigger[],
    conditions: conditions as AutomationCondition[],
    ...(input.cooldownMinutes ? { cooldownMinutes: input.cooldownMinutes } : {}),
  }
}
