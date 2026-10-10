import type { Recipe } from './recipe'

/** A day of the week, as `Date#getDay` counts it. Sunday is `0`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** The owner's input devices that an automation can follow. */
export type InputSource = 'mouse' | 'keyboard'

/**
 * One event that wakes an automation: a source, an event of that source, and its parameters.
 * Each idle event fires once per idle time, so it waits for the next use before it fires again.
 */
export type AutomationTrigger
  /** At a local `HH:MM` time, every day or on the given weekdays. */
  = | { source: 'clock', event: 'at', time: string, days?: Weekday[] }
  /** Every given number of minutes. */
    | { source: 'clock', event: 'every', minutes: number }
  /** The owner sent a message in the owner conversation. */
    | { source: 'chat', event: 'message' }
  /** The owner sent no message for the given minutes. */
    | { source: 'chat', event: 'idle', minutes: number }
  /** The owner used the device. With `afterIdleMinutes`, only the first use after an idle time that long fires. */
    | { source: InputSource, event: 'active', afterIdleMinutes?: number }
  /** The device had no use for the given minutes. */
    | { source: InputSource, event: 'idle', minutes: number }
  /** A registered module reported a new observation. */
    | { source: 'module', event: 'observation', module: string }

/** One check of the current state. Every condition of an automation must hold when a trigger fires. */
export type AutomationCondition
  /** The local time is in a range. A range that ends before it starts crosses midnight. */
  = | { kind: 'time', from: string, to: string }
  /** The local day is one of these weekdays. */
    | { kind: 'weekday', days: Weekday[] }
  /** A source had no use for at least the given minutes, or had use within them. */
    | { kind: 'state', source: 'chat' | InputSource, state: 'idle' | 'active', minutes: number }

/** When a recipe runs on its own: any trigger wakes it, every condition must hold, and runs keep a shortest gap. */
export interface Automation {
  triggers: AutomationTrigger[]
  conditions: AutomationCondition[]
  /** The shortest time between two runs, in minutes. */
  cooldownMinutes?: number
}

/** The use of one input device. */
export interface InputActivity {
  /** The latest use. */
  lastAt?: number
  /** The latest use after an idle time, and how long that idle time was. */
  lastReturn?: { at: number, idleMs: number }
}

/** What the host knows when it checks automations. */
export interface AutomationState {
  now: number
  /** When the host started checking. Time before it never counts for a recipe without `seenAt`. */
  startedAt: number
  /**
   * When each trigger of each recipe last fired, whether or not the recipe ran, by recipe id and then trigger index.
   * A trigger event counts once: conditions, the cooldown, and a running copy are checked only then.
   * Each trigger keeps its own time, so one trigger that fires never spends the event of another.
   */
  firedAt: Readonly<Record<string, Readonly<Record<number, number>>>>
  /** When each recipe last ran on its automation. The cooldown counts from it. */
  ranAt: Readonly<Record<string, number>>
  /**
   * When each recipe started to count. Time before it never counts, so a new recipe waits a full period.
   * An automation that the model set counts from when it was set, also after the host restarts.
   */
  seenAt?: Readonly<Record<string, number>>
  /** The owner's last message in the owner conversation. */
  lastOwnerMessageAt?: number
  inputs?: Readonly<Partial<Record<InputSource, InputActivity>>>
  /** The latest observation from each registered module, by module name. */
  observations?: Readonly<Record<string, { createdAt: number, text: string }>>
  /** Recipes whose earlier run still runs. They do not start again. */
  running?: ReadonlySet<string>
}

/** A recipe whose automation fired, with the trigger that fired it. */
export interface DueRecipe {
  recipe: Recipe
  trigger: AutomationTrigger
  observation?: { source: string, text: string }
}

const MINUTE = 60_000

/** Minutes after local midnight of an `HH:MM` time. An invalid time has none. */
export function minutesOfDay(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  const hours = Number(match?.[1])
  const minutes = Number(match?.[2])
  if (!match || hours > 23 || minutes > 59)
    return undefined
  return hours * 60 + minutes
}

function localDay(now: number) {
  return new Date(now).getDay() as Weekday
}

function localMinutes(now: number) {
  const date = new Date(now)
  return date.getHours() * 60 + date.getMinutes()
}

/** Today's occurrence of a local `HH:MM` time. */
function occurrenceToday(now: number, time: string) {
  const minutes = minutesOfDay(time)
  if (minutes === undefined)
    return undefined
  const day = new Date(now)
  day.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return day.getTime()
}

/** When a source was last used. Without a known use, it counts as idle since checking began. */
function lastUseOf(source: 'chat' | InputSource, state: AutomationState, since: number) {
  const lastAt = source === 'chat' ? state.lastOwnerMessageAt : state.inputs?.[source]?.lastAt
  return Math.max(lastAt ?? since, since)
}

/** Whether a trigger fired after it last fired. Time before `since` never counts, also when the trigger fired before it. */
function fires(trigger: AutomationTrigger, state: AutomationState, since: number, firedAt: number | undefined): boolean {
  const after = Math.max(firedAt ?? since, since)
  switch (trigger.source) {
    case 'clock': {
      if (trigger.event === 'every')
        return trigger.minutes > 0 && state.now - after >= trigger.minutes * MINUTE
      const today = occurrenceToday(state.now, trigger.time)
      const onDay = !trigger.days?.length || trigger.days.includes(localDay(state.now))
      return today !== undefined && onDay && state.now >= today && after < today
    }
    case 'chat': {
      if (trigger.event === 'message')
        return (state.lastOwnerMessageAt ?? 0) > after
      const idleSince = lastUseOf('chat', state, since)
      return trigger.minutes > 0 && state.now - idleSince >= trigger.minutes * MINUTE && (firedAt === undefined || firedAt < idleSince)
    }
    case 'mouse':
    case 'keyboard': {
      const activity = state.inputs?.[trigger.source]
      if (trigger.event === 'idle') {
        const idleSince = lastUseOf(trigger.source, state, since)
        return trigger.minutes > 0 && state.now - idleSince >= trigger.minutes * MINUTE && (firedAt === undefined || firedAt < idleSince)
      }
      if (!trigger.afterIdleMinutes)
        return (activity?.lastAt ?? 0) > after
      const back = activity?.lastReturn
      return back !== undefined && back.at > after && back.idleMs >= trigger.afterIdleMinutes * MINUTE
    }
    case 'module': {
      const observation = state.observations?.[trigger.module]
      return observation !== undefined && observation.createdAt > after
    }
  }
}

/** Whether a condition holds now. */
function holds(condition: AutomationCondition, state: AutomationState, since: number): boolean {
  switch (condition.kind) {
    case 'time': {
      const from = minutesOfDay(condition.from)
      const to = minutesOfDay(condition.to)
      if (from === undefined || to === undefined)
        return false
      const now = localMinutes(state.now)
      return from <= to ? now >= from && now <= to : now >= from || now <= to
    }
    case 'weekday':
      return condition.days.includes(localDay(state.now))
    case 'state': {
      const idleMs = state.now - lastUseOf(condition.source, state, since)
      return condition.state === 'idle' ? idleMs >= condition.minutes * MINUTE : idleMs < condition.minutes * MINUTE
    }
  }
}

/**
 * Checks the automations of usable recipes with steps.
 *
 * Use when:
 * - The host checks automations on its tick.
 *
 * Returns:
 * - `fired`: the indexes of the triggers that fired, by recipe id. The host records them in `firedAt`, so each event counts once.
 * - `due`: the fired recipes that start now, with the first trigger that fired. A recipe whose conditions fail, which is in
 *   its cooldown, or whose earlier run still runs, does not start, and its events are spent.
 */
export function checkAutomations(recipes: readonly Recipe[], state: AutomationState): { fired: Record<string, number[]>, due: DueRecipe[] } {
  const fired: Record<string, number[]> = {}
  const due: DueRecipe[] = []
  for (const recipe of recipes) {
    const automation = recipe.automation
    if (!automation || !recipe.enabled || !recipe.approved || !recipe.instructions.trim())
      continue
    const since = state.seenAt?.[recipe.id] ?? state.startedAt
    const firing = automation.triggers.flatMap((entry, index) => fires(entry, state, since, state.firedAt[recipe.id]?.[index]) ? [index] : [])
    const [first] = firing
    if (first === undefined)
      continue
    fired[recipe.id] = firing
    const trigger = automation.triggers[first]!
    const ranAt = state.ranAt[recipe.id]
    const cooling = ranAt !== undefined && Boolean(automation.cooldownMinutes) && state.now - ranAt < (automation.cooldownMinutes ?? 0) * MINUTE
    if (cooling || state.running?.has(recipe.id) || !automation.conditions.every(condition => holds(condition, state, since)))
      continue
    const observation = trigger.source === 'module' ? state.observations?.[trigger.module] : undefined
    due.push(trigger.source === 'module' && observation ? { recipe, trigger, observation: { source: trigger.module, text: observation.text } } : { recipe, trigger })
  }
  return { fired, due }
}
