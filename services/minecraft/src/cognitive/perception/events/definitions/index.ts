import { armSwingEvent } from './arm-swing'
import { damageTakenEvent } from './damage-taken'
import { entityMovedEvent } from './entity-moved'
import { sneakToggleEvent } from './sneak-toggle'
import { systemMessageEvent } from './system-message'

export const allEventDefinitions = [
  systemMessageEvent,
  armSwingEvent,
  sneakToggleEvent,
  entityMovedEvent,
  damageTakenEvent,
]

export {
  armSwingEvent,
  damageTakenEvent,
  entityMovedEvent,
  sneakToggleEvent,
  systemMessageEvent,
}
