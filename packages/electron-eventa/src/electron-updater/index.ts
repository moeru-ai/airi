import type { UpdateInfo } from 'builder-util-runtime'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type AutoUpdaterStatus
  = | 'idle'
    | 'disabled'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'

export interface AutoUpdaterProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface AutoUpdaterError {
  message: string
}

export interface AutoUpdaterState {
  status: AutoUpdaterStatus
  info?: Omit<UpdateInfo, 'path' | 'sha512'>
  progress?: AutoUpdaterProgress
  error?: AutoUpdaterError
}

export const electronAutoUpdaterStateChanged = defineEventa<AutoUpdaterState>('eventa:event:electron:auto-updater:state-changed')

export const autoUpdater = {
  getState: defineInvokeEventa<AutoUpdaterState>('eventa:invoke:electron:auto-updater:get-state'),
  checkForUpdates: defineInvokeEventa<AutoUpdaterState>('eventa:invoke:electron:auto-updater:check-for-updates'),
  downloadUpdate: defineInvokeEventa<AutoUpdaterState>('eventa:invoke:electron:auto-updater:download-update'),
  quitAndInstall: defineInvokeEventa<void>('eventa:invoke:electron:auto-updater:quit-and-install'),
}
