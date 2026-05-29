import type EventEmitter from 'node:events'

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { electronEvents } from '@proj-airi/electron-eventa'
import { powerMonitor } from 'electron'

import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

export function createPowerMonitorService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  function onOff<EM extends EventEmitter, E extends string>(eventEmitter: EM, event: E, listener: Parameters<EM['on']>[1]) {
    eventEmitter.on(event, listener)
    onAppBeforeQuit(() => {
      eventEmitter.off(event, listener)
    })
  }

  onOff(powerMonitor, 'suspend', () => params.context.emit(electronEvents.powerMonitor.suspended, undefined))
  onOff(powerMonitor, 'resume', () => params.context.emit(electronEvents.powerMonitor.resumed, undefined))
  onOff(powerMonitor, 'lock-screen', () => params.context.emit(electronEvents.powerMonitor.lockScreen, undefined))
  onOff(powerMonitor, 'unlock-screen', () => params.context.emit(electronEvents.powerMonitor.unlockScreen, undefined))
}
