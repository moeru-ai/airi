import { defineEventa } from '@moeru/eventa'

const eventSuspended = defineEventa('eventa:event:electron:app:suspended')
const eventResumed = defineEventa('eventa:event:electron:app:resumed')
const eventLockScreen = defineEventa('eventa:event:electron:app:lock-screen')
const eventUnlockScreen = defineEventa('eventa:event:electron:app:unlock-screen')

export const powerMonitorEvents = {
  lockScreen: eventLockScreen,
  resumed: eventResumed,
  suspended: eventSuspended,
  unlockScreen: eventUnlockScreen,
}
