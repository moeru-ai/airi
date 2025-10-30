import type { createContext } from '@unbird/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@unbird/eventa'
import { systemPreferences } from 'electron'

import { electron } from '../../../shared/eventa'

export function createSystemPreferencesService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electron.systemPreferences.getMediaAccessStatus, type => systemPreferences.getMediaAccessStatus(type))
  defineInvokeHandler(params.context, electron.systemPreferences.askForMediaAccess, type => systemPreferences.askForMediaAccess(type))
}
