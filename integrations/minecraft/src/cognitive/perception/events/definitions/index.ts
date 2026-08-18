import { armSwingEvent } from './arm-swing'
import { attackerTrackerEvent } from './attacker-tracker'
import { damageTakenEvent } from './damage-taken'
import { entityMovedEvent } from './entity-moved'
import { fallTrackerEvent } from './fall-tracker'
import { lowHealthEvent } from './low-health'
import { sneakToggleEvent } from './sneak-toggle'
import { systemMessageEvent } from './system-message'

export const allEventDefinitions = [
  systemMessageEvent,
  armSwingEvent,
  sneakToggleEvent,
  entityMovedEvent,
  fallTrackerEvent,
  attackerTrackerEvent,
  lowHealthEvent,
  damageTakenEvent,
]

export {
  armSwingEvent,
  attackerTrackerEvent,
  damageTakenEvent,
  entityMovedEvent,
  fallTrackerEvent,
  lowHealthEvent,
  sneakToggleEvent,
  systemMessageEvent,
}
