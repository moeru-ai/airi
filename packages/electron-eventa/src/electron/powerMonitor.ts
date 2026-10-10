import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

const eventSuspended = defineEventa('eventa:event:electron:app:suspended')
const eventResumed = defineEventa('eventa:event:electron:app:resumed')
const eventLockScreen = defineEventa('eventa:event:electron:app:lock-screen')
const eventUnlockScreen = defineEventa('eventa:event:electron:app:unlock-screen')

/** Seconds since the last mouse or keyboard input anywhere on the system. */
const getSystemIdleTime = defineInvokeEventa<number>('eventa:invoke:electron:power-monitor:get-system-idle-time')

export const powerMonitor = {
  getSystemIdleTime,
}

export const powerMonitorEvents = {
  lockScreen: eventLockScreen,
  resumed: eventResumed,
  suspended: eventSuspended,
  unlockScreen: eventUnlockScreen,
}
