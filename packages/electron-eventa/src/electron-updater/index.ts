import type { UpdateInfo } from 'builder-util-runtime'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export interface AutoUpdaterDiagnostics {
  arch: string
  channel: string
  executablePath: string
  feedUrl?: string
  installDirectory: string
  isOverrideActive: boolean
  logFilePath: string
  platform: string
  requiresAdminForInstallPath: boolean
}

export interface AutoUpdaterError {
  message: string
}

export interface AutoUpdaterProgress {
  bytesPerSecond: number
  percent: number
  total: number
  transferred: number
}

export interface AutoUpdaterState {
  diagnostics?: AutoUpdaterDiagnostics
  error?: AutoUpdaterError
  info?: Omit<UpdateInfo, 'path' | 'sha512'>
  progress?: AutoUpdaterProgress
  status: AutoUpdaterStatus
}

export type AutoUpdaterStatus
  = | 'available'
    | 'checking'
    | 'disabled'
    | 'downloaded'
    | 'downloading'
    | 'error'
    | 'idle'
    | 'not-available'

export const electronAutoUpdaterStateChanged = defineEventa<AutoUpdaterState>('eventa:event:electron:auto-updater:state-changed')

export const autoUpdater = {
  checkForUpdates: defineInvokeEventa<AutoUpdaterState>('eventa:invoke:electron:auto-updater:check-for-updates'),
  downloadUpdate: defineInvokeEventa<AutoUpdaterState>('eventa:invoke:electron:auto-updater:download-update'),
  getState: defineInvokeEventa<AutoUpdaterState>('eventa:invoke:electron:auto-updater:get-state'),
  quitAndInstall: defineInvokeEventa<void>('eventa:invoke:electron:auto-updater:quit-and-install'),
}
