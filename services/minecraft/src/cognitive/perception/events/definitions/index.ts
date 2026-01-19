import { armSwingEvent } from './arm-swing'
import { damageTakenEvent } from './damage-taken'
import { entityMovedEvent } from './entity-moved'
import { itemCollectedEvent } from './item-collected'
import { sneakToggleEvent } from './sneak-toggle'
import { soundHeardEvent } from './sound-heard'
import { systemMessageEvent } from './system-message'

export const allEventDefinitions = [
  systemMessageEvent,
  armSwingEvent,
  sneakToggleEvent,
  entityMovedEvent,
  soundHeardEvent,
  damageTakenEvent,
  itemCollectedEvent,
]

export {
  armSwingEvent,
  damageTakenEvent,
  entityMovedEvent,
  itemCollectedEvent,
  sneakToggleEvent,
  soundHeardEvent,
  systemMessageEvent,
}
