import type { HomeAssistantEntity } from './client'

/**
 * Which Home Assistant entities the model can reach.
 *
 * The user owns this choice, and the settings page writes it. It works on
 * entities rather than domains. A user who wants AIRI to run the lights does not
 * want it to open the front door, and one domain can hold both a harmless device
 * and a door.
 *
 * - `all` reaches every entity.
 * - `allow` reaches the listed entities and nothing else.
 * - `deny` reaches every entity except the listed ones.
 */
export type HomeAssistantExposure
  = | { mode: 'all' }
    | { mode: 'allow', entityIds: string[] }
    | { mode: 'deny', entityIds: string[] }

/** The policy a user gets before they choose anything. */
export const allEntitiesExposure: HomeAssistantExposure = { mode: 'all' }

/** The mode names the policy accepts. */
const exposureModes = ['all', 'allow', 'deny'] as const

/** One access mode. */
export type HomeAssistantExposureMode = typeof exposureModes[number]

/**
 * Reports whether a stored value names a mode.
 *
 * The value comes from `localStorage`, which a stale build or a hand edit can
 * write. A value outside the three modes would leave the settings page and the
 * policy reading different rules, which is worse than reaching every device.
 */
export function isExposureMode(value: unknown): value is HomeAssistantExposureMode {
  return typeof value === 'string' && (exposureModes as readonly string[]).includes(value)
}

/** Reports whether the user exposed one entity. */
export function isEntityExposed(exposure: HomeAssistantExposure, entityId: string): boolean {
  switch (exposure.mode) {
    case 'allow':
      return exposure.entityIds.includes(entityId)
    case 'deny':
      return !exposure.entityIds.includes(entityId)
    default:
      return true
  }
}

/** Keeps the entities the model may see. */
export function filterExposed(exposure: HomeAssistantExposure, entities: HomeAssistantEntity[]): HomeAssistantEntity[] {
  return entities.filter(entity => isEntityExposed(exposure, entity.entityId))
}

/**
 * Rejects an entity the user did not expose.
 *
 * The model reads this message, so it names the entity and the list that holds
 * it. The model can then ask the user for the one change that helps.
 */
export function assertEntityExposed(exposure: HomeAssistantExposure, entityId: string): void {
  if (isEntityExposed(exposure, entityId))
    return

  const message = exposure.mode === 'allow'
    ? `Entity "${entityId}" is not available. The user allows only chosen devices, and this one is not on the list. Ask the user to add "${entityId}" in the Home Assistant settings.`
    : `Entity "${entityId}" is not available. The user blocks this device. Ask the user to remove it from the blocked devices in the Home Assistant settings.`
  throw new Error(message)
}

/**
 * Explains how many entities the list hides.
 *
 * A listing that silently drops rows reads as "the user owns no such device".
 * This sentence tells the model that a list exists and who wrote it.
 */
export function describeHidden(exposure: HomeAssistantExposure, count: number): string {
  if (!count)
    return ''

  const subject = count === 1 ? '1 entity is' : `${count} entities are`
  return exposure.mode === 'allow'
    ? `${subject} not on the user's allow list.`
    : `${subject} on the user's blocked list.`
}

/** States the policy in one sentence, so a tool description can carry it. */
export function describeExposure(exposure: HomeAssistantExposure): string {
  if (exposure.mode === 'all')
    return 'The user exposes every device.'

  const count = exposure.entityIds.length
  if (exposure.mode === 'allow') {
    return count
      ? `The user exposes only ${count} chosen device${count === 1 ? '' : 's'}. A call to any other device fails.`
      : 'The user exposes no device, so no call can succeed. Ask the user to allow a device in the Home Assistant settings.'
  }

  return count
    ? `The user blocks ${count} device${count === 1 ? '' : 's'}. A call to a blocked device fails.`
    : 'The user exposes every device.'
}
