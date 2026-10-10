import type { BrowserWindow } from 'electron'
import type { ProvidedBy } from 'injeca'

import type { I18n } from '../../libs/i18n'

import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { app, ipcMain, Notification } from 'electron'
import { injeca } from 'injeca'
import { object, optional, parse, string } from 'valibot'

import {
  desktopCompanionChanged,
  desktopCompanionGet,
  desktopCompanionSetPreferences,
  desktopNotificationClear,
  desktopNotificationPublish,
  desktopNotificationRead,
  desktopReactionRequested,
} from '../../../shared/eventa/desktop-companion'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { DesktopCompanionFileStorage } from './desktop-companion-storage'
import { DesktopNotificationCenter } from './desktop-notifications'

/** Constructs the main-process singleton through injeca, after Electron and the locale are ready. */
export function setupDesktopCompanion(i18n: I18n) {
  const center = new DesktopNotificationCenter(
    new DesktopCompanionFileStorage(join(app.getPath('userData'), 'desktop-companion.json')),
    {
      supported: () => Notification.isSupported(),
      show: (input, onEvent) => {
        const notification = new Notification({
          title: 'AIRI',
          body: input.body || i18n.t('tamagotchi.settings.desktop-companion.private-message'),
          // Character priority never bypasses the notification server's DND policy.
          urgency: 'normal',
          silent: true,
        })
        notification.once('show', () => onEvent('shown'))
        notification.once('click', () => onEvent('click'))
        notification.once('close', () => onEvent('closed'))
        notification.once('failed', () => onEvent('failed'))
        notification.show()
        return () => notification.close()
      },
    },
  )
  onAppBeforeQuit(() => center.dispose())
  return center
}

/** Each trusted AIRI window receives snapshots. Foreign renderer IDs cannot mutate this center. */
export async function createDesktopCompanionService(params: { window: BrowserWindow }) {
  const { center } = await injeca.resolve({ center: 'services:desktop-companion' } as { center: ProvidedBy<DesktopNotificationCenter> })
  const { context } = createContext(ipcMain, params.window, { onlySameWindow: true })
  const assertSender = (senderId?: number) => {
    if (senderId !== params.window.webContents.id)
      throw new Error('Desktop companion request came from another window')
  }
  defineInvokeHandler(context, desktopCompanionGet, (_, options) => {
    assertSender(options?.raw.ipcMainEvent.sender.id)
    return center.snapshot()
  })
  defineInvokeHandler(context, desktopCompanionSetPreferences, (value, options) => {
    assertSender(options?.raw.ipcMainEvent.sender.id)
    return center.updatePreferences(value)
  })
  defineInvokeHandler(context, desktopNotificationPublish, (value, options) => {
    assertSender(options?.raw.ipcMainEvent.sender.id)
    return center.publish(value)
  })
  defineInvokeHandler(context, desktopNotificationRead, (value, options) => {
    assertSender(options?.raw.ipcMainEvent.sender.id)
    return center.markRead(parse(object({ id: optional(string()) }), value).id)
  })
  defineInvokeHandler(context, desktopNotificationClear, (_, options) => {
    assertSender(options?.raw.ipcMainEvent.sender.id)
    return center.clear()
  })
  const offSnapshot = center.subscribe((snapshot) => {
    void context.emit(desktopCompanionChanged, snapshot).catch(() => {})
  })
  const offReaction = center.onReaction((intent) => {
    void context.emit(desktopReactionRequested, intent).catch(() => {})
  })
  params.window.once('closed', () => {
    offSnapshot()
    offReaction()
  })
}
