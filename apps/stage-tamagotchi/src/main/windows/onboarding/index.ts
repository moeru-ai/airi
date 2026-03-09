import { join, resolve } from 'node:path'

import { is } from '@electron-toolkit/utils'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow, ipcMain, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { electronOnboardingClose, electronOnboardingCompleted, electronOnboardingSkipped, electronOpenOnboarding } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'

export interface OnboardingWindowManager {
  getWindow: () => BrowserWindow | null
  showIfNeeded: () => Promise<boolean>
  close: () => void
  markCompleted: () => void
  markSkipped: () => void
}

export function setupOnboardingWindowManager(): OnboardingWindowManager {
  let window: BrowserWindow | undefined

  const close = () => {
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  const markCompleted = () => {
    close()
  }

  const markSkipped = () => {
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
    const { context } = createContext(ipcMain, newWindow)

    defineInvokeHandler(context, electronOnboardingClose, () => close())
    defineInvokeHandler(context, electronOnboardingCompleted, () => markCompleted())
    defineInvokeHandler(context, electronOnboardingSkipped, () => markSkipped())
    defineInvokeHandler(context, electronOpenOnboarding, async () => {
      await showIfNeeded()
      return true
    })

    window = newWindow
    return newWindow
  }

  async function showIfNeeded() {
    if (window && !window.isDestroyed()) {
      window.show()
      window.focus()
      return true
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
  }
}
