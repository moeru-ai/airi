// SPDX-FileCopyrightText: Copyright (c) Alec Armbruster, Licensed under MIT License
// SPDX-FileCopyrightText: Copyright (c) Moeru AI Project AIRI Team

import type { Format, LogLevelString } from '@guiiai/logg'
import type { MutexInterface } from 'async-mutex'
import type { BrowserWindow, DesktopCapturerSource, SourcesOptions } from 'electron'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { Mutex, withTimeout } from 'async-mutex'
import { app, desktopCapturer, ipcMain, session as sessionModule } from 'electron'
import { nanoid } from 'nanoid'

import { screenCapture } from '..'
import {
  checkMacOSScreenCapturePermission,
  requestMacOSScreenCapturePermission,
  toSerializableDesktopCapturerSource,
} from './utils'

export const defaultSourcesOptions: SourcesOptions = { types: ['screen'] }

export const featureSwitchKey = 'enable-features' as const

export enum LoopbackAudioTypes {
  Loopback = 'loopback',
  LoopbackWithMute = 'loopbackWithMute',
}

enum DefaultFeatureFlags {
  PulseaudioLoopbackForScreenShare = 'PulseaudioLoopbackForScreenShare',
  /**
   * Note(Makito): Some discussions on this flag can be found here:
   *
   * - {@link https://issues.chromium.org/issues/355308245}
   * - {@link https://issues.chromium.org/issues/394329567}
   */
  MacLoopbackAudioForScreenShare = 'MacLoopbackAudioForScreenShare',
}

enum CoreAudioTapFeatureFlags {
  MacCoreAudioTapSystemAudioLoopbackOverride = 'MacCatapSystemAudioLoopbackCapture',
}

enum ScreenCaptureKitFeatureFlags {
  MacScreenCaptureKitSystemAudioLoopbackOverride = 'MacSckSystemAudioLoopbackOverride',
}

export function buildFeatureFlags({
  otherEnabledFeatures,
  forceCoreAudioTap,
}: {
  otherEnabledFeatures?: string[]
  forceCoreAudioTap?: boolean
}): string {
  const featureFlags = [...Object.values(DefaultFeatureFlags), ...(otherEnabledFeatures ?? [])]

  if (forceCoreAudioTap) {
    featureFlags.push(CoreAudioTapFeatureFlags.MacCoreAudioTapSystemAudioLoopbackOverride)
  }
  else {
    featureFlags.push(ScreenCaptureKitFeatureFlags.MacScreenCaptureKitSystemAudioLoopbackOverride)
  }

  return featureFlags.join(',')
}

let initMainCalled = false

export interface InitMainOptions {
  forceCoreAudioTap?: boolean
  mutexAcquireTimeout?: number
  loggerOptions?: {
    logLevel?: string
    format?: 'json' | 'plain'
  }
}

export interface InitWindowOptions {
  loopbackWithMute?: boolean
  sourcesOptions?: SourcesOptions
  onAfterGetSources?: (sources: DesktopCapturerSource[]) => DesktopCapturerSource[]
  loggerOptions?: {
    logLevel?: string
    format?: 'json' | 'plain'
  }
}

export interface GetLoopbackAudioMediaStreamOptions {
  removeVideo?: boolean
}

let setSourceMutex: MutexInterface
let screenCaptureSourceMutexHandle: string | undefined
let setSourceMutexTimeoutHandle: NodeJS.Timeout | undefined

export function initScreenCaptureForMain(options: InitMainOptions = {}): void {
  const {
    forceCoreAudioTap = false,
    mutexAcquireTimeout = 5000,
  } = options

  let log = useLogg('screen-capture').useGlobalConfig()
  if (options?.loggerOptions?.logLevel) {
    log = log.withLogLevelString((options?.loggerOptions?.logLevel ?? 'info') as LogLevelString)
  }
  if (options?.loggerOptions?.format) {
    log = log.withFormat((options?.loggerOptions?.format ?? 'plain') as Format)
  }

  if (mutexAcquireTimeout <= 0 || !Number.isFinite(mutexAcquireTimeout) || Number.isNaN(mutexAcquireTimeout)) {
    throw new Error('mutexAcquireTimeout must be a positive finite number')
  }

  if (initMainCalled) {
    log.warn('initScreenCaptureForMain should only be called once')
    return
  }
  initMainCalled = true
  setSourceMutex = withTimeout(new Mutex(), mutexAcquireTimeout)

  // Get other enabled features from the command line.
  const otherEnabledFeatures = app.commandLine.getSwitchValue(featureSwitchKey)?.split(',')

  // Remove the switch if it exists.
  if (app.commandLine.hasSwitch(featureSwitchKey)) {
    app.commandLine.removeSwitch(featureSwitchKey)
  }

  // Add the feature flags to the command line with any other user-enabled features concatenated.
  const currentFeatureFlags = buildFeatureFlags({
    otherEnabledFeatures,
    forceCoreAudioTap,
  })

  app.commandLine.appendSwitch(featureSwitchKey, currentFeatureFlags)
}

function resetScreenCaptureSource() {
  sessionModule.defaultSession.setDisplayMediaRequestHandler(null)
  clearTimeout(setSourceMutexTimeoutHandle)
  setSourceMutexTimeoutHandle = undefined
  screenCaptureSourceMutexHandle = undefined
}

const initializedWindows = new WeakSet<BrowserWindow>()

// NOTICE: use this to guard to prevent handling destroyed window
// especially when trying to get window title,
// but window.id is another story as window.id is stable and unique even
// after window is destroyed
function tryWindowTitle(window: BrowserWindow, previous?: string): string {
  if (window.isDestroyed()) {
    return previous || '<destroyed>'
  }

  const title = window.getTitle()
  return title
}

export function initScreenCaptureForWindow(window: BrowserWindow, options?: InitWindowOptions): void {
  let log = useLogg('screen-capture').useGlobalConfig()
  if (options?.loggerOptions?.logLevel) {
    log = log.withLogLevelString((options?.loggerOptions?.logLevel ?? 'info') as LogLevelString)
  }
  if (options?.loggerOptions?.format) {
    log = log.withFormat((options?.loggerOptions?.format ?? 'plain') as Format)
  }

  const windowId = window.id
  const windowTitle = tryWindowTitle(window)

  log.withFields({ windowId, windowTitle: tryWindowTitle(window, windowTitle) }).debug(`init for window`)

  if (!initMainCalled) {
    // Throwing an error because this is unlikely to be recoverable.
    throw new Error('initScreenCaptureForMain must be called before calling initScreenCaptureForWindow')
  }
  if (initializedWindows.has(window)) {
    log.withFields({ windowId, windowTitle: tryWindowTitle(window, windowTitle) }).warn('initScreenCaptureForWindow should only be called once per window')
    return
  }

  initializedWindows.add(window)

  const { context } = createContext(ipcMain, window, { onlySameWindow: true })
  const session = sessionModule.defaultSession

  defineInvokeHandler(context, screenCapture.checkMacOSPermission, async () => checkMacOSScreenCapturePermission())
  defineInvokeHandler(context, screenCapture.requestMacOSPermission, async () => requestMacOSScreenCapturePermission())

  defineInvokeHandler(context, screenCapture.getSources, async (sourcesOptions) => {
    // NOTICE(@nekomeowww): In probability of 9/10, the window thumbnail is purely empty or black, sources printed and
    // nothing is returned from the desktopCapturer API.
    // NOTICE(@sumimakito): Not only thumbnail is empty, the appIcon could be empty as well with nothing returned.
    // REVIEW(@sumimakito): This has nothing to do with out side, probably related to Electron Bug, you can
    // read more here https://github.com/electron/electron/issues/44504
    const sources = await desktopCapturer.getSources(sourcesOptions)
    return sources.map(source => toSerializableDesktopCapturerSource(source))
  })

  defineInvokeHandler(context, screenCapture.setSource, async (request, eventaOptions) => {
    // FIXME: Would be better if `onlySameWindow` in `createContext` also filters out invocations here.
    if (window.webContents.id !== eventaOptions?.raw.ipcMainEvent.sender.id)
      return

    const { timeout } = request
    if (typeof timeout === 'number' && (timeout <= 0 || !Number.isFinite(timeout) || Number.isNaN(timeout))) {
      throw new Error('timeout must be a positive finite number')
    }

    await setSourceMutex.acquire()
    log.withFields({ windowId, windowTitle: tryWindowTitle(window, windowTitle) }).debug('setSourceMutex acquired')

    clearTimeout(setSourceMutexTimeoutHandle)
    const handle = nanoid()
    setSourceMutexTimeoutHandle = undefined
    screenCaptureSourceMutexHandle = handle

    try {
      session.setDisplayMediaRequestHandler(async (_request, callback) => {
        const sources = await desktopCapturer.getSources(request.options)
        const source = sources.find(source => source.id === request.sourceId)
        if (!source) {
          throw new Error(`Source with id ${request.sourceId} not found.`)
        }

        callback({
          video: source,
          audio: options?.loopbackWithMute ? LoopbackAudioTypes.LoopbackWithMute : LoopbackAudioTypes.Loopback,
        })
      })

      setSourceMutexTimeoutHandle = setTimeout(() => {
        if (screenCaptureSourceMutexHandle !== handle)
          return

        resetScreenCaptureSource()
        setSourceMutex.release()

        log
          .withFields({ windowId, windowTitle: tryWindowTitle(window, windowTitle) })
          .warn(
            `setSourceMutex released for window due to timeout. `
            + 'Please make sure to invoke screenCaptureResetSource when getDisplayMedia is completed.',
          )
      }, timeout ?? 5000)

      return handle
    }
    catch (e) {
      log
        .withFields({ windowId, windowTitle: tryWindowTitle(window, windowTitle) })
        .withError(e)
        .error('screenCaptureSetSourceEx failed for window')

      resetScreenCaptureSource()
      setSourceMutex.release()
      throw e
    }
  })

  defineInvokeHandler(context, screenCapture.resetSource, async (mutexHandle) => {
    if (screenCaptureSourceMutexHandle !== mutexHandle)
      return

    resetScreenCaptureSource()
    setSourceMutex.release()

    log.withFields({ windowId, windowTitle: tryWindowTitle(window, windowTitle) }).debug('setSourceMutex released by window')
  })
}
