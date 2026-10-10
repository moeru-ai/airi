import type { HomeAssistantEntity } from './client'

import { domainOf } from './client'

/**
 * View data for the Home Assistant settings page.
 *
 * These functions build what a card and a tab show. They hold no policy, so the
 * page can render them without reading the access list.
 */

/** One entity, reduced to the fields a tile shows. */
export interface HomeAssistantEntitySummary {
  entityId: string
  domain: string
  /** The friendly name, or the entity id when the instance reports none. */
  name: string
  /** The raw Home Assistant state, which the page either localizes or shows as is. */
  state: string
  /** The UnoCSS class of the domain icon. */
  iconClass: string
  /** Whether the domain rule reads the state as active, which colors the icon. */
  active: boolean
}

/**
 * The icon of each domain.
 *
 * The names are literals on purpose. UnoCSS compiles an icon class only when the
 * literal appears in scanned source, so a name built at runtime never renders.
 * Home Assistant's own `attributes.icon` is a runtime `mdi:` name, which this
 * project cannot compile, and only a few entities carry one.
 *
 * Every name below exists in the installed `@iconify-json/solar` set, which the
 * rest of the application already uses.
 */
const DOMAIN_ICONS: Record<string, string> = {
  air_quality: 'i-solar:leaf-bold-duotone',
  alarm_control_panel: 'i-solar:shield-check-bold-duotone',
  automation: 'i-solar:reorder-bold-duotone',
  binary_sensor: 'i-solar:radar-bold-duotone',
  button: 'i-solar:widget-2-bold-duotone',
  calendar: 'i-solar:calendar-bold-duotone',
  camera: 'i-solar:camera-bold-duotone',
  climate: 'i-solar:temperature-bold-duotone',
  // The same icon the Home Assistant module uses in the settings list, because
  // this entity is the Home Assistant agent itself rather than a device.
  conversation: 'i-solar:home-smile-bold-duotone',
  cover: 'i-solar:garage-bold-duotone',
  date: 'i-solar:calendar-bold-duotone',
  datetime: 'i-solar:clock-circle-bold-duotone',
  device_tracker: 'i-solar:map-point-bold-duotone',
  event: 'i-solar:bell-bold-duotone',
  fan: 'i-solar:wind-bold-duotone',
  geo_location: 'i-solar:radar-2-bold-duotone',
  group: 'i-solar:layers-bold-duotone',
  humidifier: 'i-solar:waterdrop-bold-duotone',
  image: 'i-solar:camera-bold-duotone',
  image_processing: 'i-solar:eye-bold-duotone',
  input_boolean: 'i-solar:widget-2-bold-duotone',
  input_datetime: 'i-solar:calendar-bold-duotone',
  input_number: 'i-solar:hashtag-bold-duotone',
  input_select: 'i-solar:list-check-bold-duotone',
  input_text: 'i-solar:text-bold-duotone',
  light: 'i-solar:lightbulb-bold-duotone',
  lock: 'i-solar:lock-bold-duotone',
  media_player: 'i-solar:music-notes-bold-duotone',
  notify: 'i-solar:bell-bold-duotone',
  number: 'i-solar:hashtag-bold-duotone',
  person: 'i-solar:user-bold-duotone',
  remote: 'i-solar:tv-bold-duotone',
  scene: 'i-solar:star-bold-duotone',
  script: 'i-solar:code-bold-duotone',
  select: 'i-solar:list-check-bold-duotone',
  sensor: 'i-solar:graph-up-bold-duotone',
  siren: 'i-solar:bell-bold-duotone',
  stt: 'i-solar:microphone-3-bold-duotone',
  sun: 'i-solar:sun-2-bold-duotone',
  switch: 'i-solar:plug-circle-bold-duotone',
  text: 'i-solar:text-bold-duotone',
  time: 'i-solar:clock-circle-bold-duotone',
  todo: 'i-solar:checklist-bold-duotone',
  tts: 'i-solar:volume-loud-bold-duotone',
  update: 'i-solar:refresh-bold-duotone',
  vacuum: 'i-solar:washing-machine-bold-duotone',
  valve: 'i-solar:garage-bold-duotone',
  water_heater: 'i-solar:cup-hot-bold-duotone',
  weather: 'i-solar:cloud-sun-2-bold-duotone',
  zone: 'i-solar:map-point-bold-duotone',
}

/** The icon for a domain the table does not name. */
const FALLBACK_ICON = 'i-solar:question-circle-bold-duotone'

/**
 * The state that counts as active for each domain.
 *
 * Home Assistant drives the colored part of its own tiles from one rule per
 * domain. A cover is active when it is `open`, not when it is `on`, so a single
 * `state === 'on'` test would mislabel nearly every domain that is not a light.
 */
const ACTIVE_STATES: Record<string, string[]> = {
  automation: ['on'],
  binary_sensor: ['on'],
  climate: ['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'],
  cover: ['open', 'opening'],
  device_tracker: ['home'],
  fan: ['on'],
  group: ['on'],
  humidifier: ['on'],
  input_boolean: ['on'],
  light: ['on'],
  lock: ['locked', 'locking', 'unlocking'],
  media_player: ['playing'],
  person: ['home'],
  remote: ['on'],
  script: ['on'],
  siren: ['on'],
  switch: ['on'],
  update: ['on'],
  valve: ['open', 'opening'],
  vacuum: ['cleaning', 'returning'],
}

/** The UnoCSS class for one domain. */
export function domainIcon(domain: string): string {
  return DOMAIN_ICONS[domain] ?? FALLBACK_ICON
}

/** Reports whether a state reads as active for its domain. */
export function isEntityActive(domain: string, state: string): boolean {
  return (ACTIVE_STATES[domain] ?? []).includes(state)
}

function toName(entity: HomeAssistantEntity): string {
  const name = entity.attributes.friendly_name
  return typeof name === 'string' && name ? name : entity.entityId
}

/** Reduces the entities of one instance to the rows a tile shows. */
export function summarizeEntities(entities: HomeAssistantEntity[]): HomeAssistantEntitySummary[] {
  return entities.map((entity) => {
    const entityId = entity.entityId
    const domain = domainOf(entityId)
    return {
      entityId,
      domain,
      name: toName(entity),
      state: entity.state,
      iconClass: domainIcon(domain),
      active: isEntityActive(domain, entity.state),
    }
  })
}

/** Counts the entities of each domain, so the page can offer one tab per domain. */
export function summarizeDomains(entities: Array<{ entityId: string }>): Array<{ domain: string, count: number }> {
  const counts = new Map<string, number>()
  for (const entity of entities) {
    const domain = domainOf(entity.entityId)
    counts.set(domain, (counts.get(domain) ?? 0) + 1)
  }

  return [...counts]
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => left.domain.localeCompare(right.domain))
}

/** The translation key that names one domain. */
export function domainLabelKey(domain: string): string {
  return `settings.pages.modules.home-assistant.domains.${domain}`
}

/**
 * Names a domain for a tab.
 *
 * A translator returns the key itself when the key is missing, so this falls back
 * to the raw id for a domain outside the translated list. `input_boolean` reads
 * better to a user than the key path that produced it.
 */
export function domainLabel(translate: (key: string) => string, domain: string): string {
  const key = domainLabelKey(domain)
  const label = translate(key)
  return label === key ? domain : label
}

/**
 * Reports whether a state can carry a translation.
 *
 * Home Assistant writes every state it names in lower case with underscores.
 * Anything else is a value, such as a temperature or a timestamp, and a lookup
 * for it would only produce a missing-key warning.
 */
export function isTranslatableState(state: string): boolean {
  return /^[a-z][a-z0-9_-]*$/.test(state)
}

/**
 * The translation keys that can name a state, most specific first.
 *
 * Home Assistant names states per domain, because the same word reads
 * differently. A binary sensor is on or off, while a lock is locked or
 * unlocked, and a `binary_sensor.on` reads "Detected" where a generic `on` reads
 * "On". The generic block carries the words every domain shares.
 */
export function stateLabelKeys(domain: string, state: string): string[] {
  const base = 'settings.pages.modules.home-assistant.states'
  return [`${base}.${domain}.${state}`, `${base}.generic.${state}`]
}

/** One date or time a state carries. */
export interface HomeAssistantStateMoment {
  kind: 'date' | 'datetime'
  at: Date
}

const dateStatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const dateTimeStatePattern = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/

/**
 * Reads a state that is a date or a timestamp.
 *
 * Home Assistant reports these as ISO 8601 text, which reads as machine output
 * on a card. A date with no time becomes a local midnight, so a timezone west of
 * UTC cannot shift it to the day before.
 */
export function parseStateMoment(state: string): HomeAssistantStateMoment | undefined {
  const date = dateStatePattern.exec(state)
  if (date)
    return { kind: 'date', at: new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3])) }

  if (!dateTimeStatePattern.test(state))
    return undefined

  const at = new Date(state)
  return Number.isNaN(at.getTime()) ? undefined : { kind: 'datetime', at }
}
