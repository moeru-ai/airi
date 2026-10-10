import type EventEmitter from 'node:events'

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { electron, electronEvents } from '@proj-airi/electron-eventa'
import { powerMonitor } from 'electron'

import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

export function createPowerMonitorService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  // The listeners live on the app-wide power monitor, so they go with the
  // window that owns them. A chat mode switch recreates a window, and each
  // copy would otherwise stay subscribed until the app quits.
  function onOff<EM extends EventEmitter, E extends string>(eventEmitter: EM, event: E, listener: Parameters<EM['on']>[1]) {
    const remove = () => {
      eventEmitter.off(event, listener)
    }
    eventEmitter.on(event, listener)
    const offBeforeQuit = onAppBeforeQuit(remove)
    params.window.once('closed', () => {
      remove()
      offBeforeQuit()
    })
  }

  onOff(powerMonitor, 'suspend', () => params.context.emit(electronEvents.powerMonitor.suspended, undefined))
  onOff(powerMonitor, 'resume', () => params.context.emit(electronEvents.powerMonitor.resumed, undefined))
  onOff(powerMonitor, 'lock-screen', () => params.context.emit(electronEvents.powerMonitor.lockScreen, undefined))
  onOff(powerMonitor, 'unlock-screen', () => params.context.emit(electronEvents.powerMonitor.unlockScreen, undefined))

  // Automations read it to follow the owner's input in every app.
  defineInvokeHandler(params.context, electron.powerMonitor.getSystemIdleTime, () => powerMonitor.getSystemIdleTime())
}
