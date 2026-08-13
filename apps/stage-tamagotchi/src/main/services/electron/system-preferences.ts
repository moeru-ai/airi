import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { systemPreferences } from 'electron'

import { electron } from '../../../shared/eventa'

export function createSystemPreferencesService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electron.systemPreferences.getMediaAccessStatus, (type) => {
    if (!type) {
      return 'not-determined'
    }

    try {
      return systemPreferences.getMediaAccessStatus(type[0])
    }
    catch (error) {
      // NOTICE:
      // Electron does not provide this API on Linux.
      // Some Electron builds expose no function, while mocks and older bindings can throw a TypeError.
      // Source/context: https://github.com/moeru-ai/airi/issues/2132
      // Removal condition: Electron provides one cross-platform media permission API.
      if (error instanceof TypeError)
        return 'unknown'

      throw error
    }
  })
  defineInvokeHandler(params.context, electron.systemPreferences.askForMediaAccess, async (type) => {
    if (!type) {
      return false
    }

    try {
      return await systemPreferences.askForMediaAccess(type[0])
    }
    catch (error) {
      // NOTICE:
      // Electron provides this native prompt only on macOS.
      // Linux permission requests use the session permission handlers instead.
      // Source/context: https://github.com/moeru-ai/airi/issues/2132
      // Removal condition: Electron provides this prompt on Linux and Windows.
      if (error instanceof TypeError)
        return false

      throw error
    }
  })
}
