import { join, resolve } from 'node:path'

import { is } from '@electron-toolkit/utils'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { boolean, object, optional } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { electronOnboardingClose, electronOnboardingCompleted, electronOnboardingGetConfig, electronOnboardingSkipped } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'

const onboardingConfigSchema = object({
  completed: optional(boolean(), false),
  skipped: optional(boolean(), false),
})

export interface OnboardingWindowManager {
  getWindow: () => BrowserWindow | null
  showIfNeeded: () => Promise<boolean>
  close: () => void
  markCompleted: () => void
  markSkipped: () => void
  isCompleted: () => boolean
}

export function setupOnboardingWindowManager(): OnboardingWindowManager {
  let window: BrowserWindow | undefined

  const { setup: setupConfig, get: getConfig, update: updateConfig } = createConfig('onboarding', 'config.json', onboardingConfigSchema, {
    default: { completed: false, skipped: false },
    autoHeal: true,
  })

  setupConfig()

  const isCompleted = () => getConfig()?.completed ?? false
  const isSkipped = () => getConfig()?.skipped ?? false

  const close = () => {
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  const markCompleted = () => {
    updateConfig({ completed: true, skipped: false })
    close()
  }

  const markSkipped = () => {
    updateConfig({ completed: false, skipped: true })
    close()
  }

  const createWindow = async () => {
    if (window && !window.isDestroyed()) {
      return window
    }

    const newWindow = new BrowserWindow({
      title: 'Welcome to AIRI',
      width: 500,
      height: 700,
      minWidth: 400,
      minHeight: 500,
      show: false,
      icon,
      resizable: true,
      frame: false,
      titleBarStyle: 'hidden',
      transparent: false,
      backgroundColor: '#0f0f0f',
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    // NOTICE: in development mode, open devtools by default
    if (is.dev) {
      try {
        newWindow.webContents.openDevTools({ mode: 'detach' })
      }
      catch (err) {
        console.error('failed to open devtools:', err)
      }
    }

    newWindow.on('ready-to-show', () => newWindow.show())
    newWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    newWindow.on('closed', () => {
      window = undefined
    })

    await load(newWindow, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/onboarding'))

    // Setup IPC handlers for this window
    ipcMain.setMaxListeners(0)
    const { context } = createContext(ipcMain, newWindow)

    defineInvokeHandler(context, electronOnboardingClose, () => close())
    defineInvokeHandler(context, electronOnboardingCompleted, () => markCompleted())
    defineInvokeHandler(context, electronOnboardingSkipped, () => markSkipped())
    defineInvokeHandler(context, electronOnboardingGetConfig, () => getConfig())

    window = newWindow
    return newWindow
  }

  const showIfNeeded = async () => {
    // Don't show if already completed or skipped
    if (isCompleted() || isSkipped()) {
      return false
    }

    await createWindow()
    return true
  }

  return {
    getWindow: () => window ?? null,
    showIfNeeded,
    close,
    markCompleted,
    markSkipped,
    isCompleted,
  }
}
