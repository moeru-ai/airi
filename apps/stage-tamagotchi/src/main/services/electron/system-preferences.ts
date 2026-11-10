import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { systemPreferences } from 'electron'
import { isLinux } from 'std-env'

import { electron } from '../../../shared/eventa'

export function createSystemPreferencesService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electron.systemPreferences.getMediaAccessStatus, (type) => {
    if (isLinux || !type) {
      return 'not-determined'
    }

    return systemPreferences.getMediaAccessStatus(type[0])
  })
  defineInvokeHandler(params.context, electron.systemPreferences.askForMediaAccess, (type) => {
    if (isLinux || !type) {
      return Promise.resolve(false)
    }

    return systemPreferences.askForMediaAccess(type[0])
  })
}
