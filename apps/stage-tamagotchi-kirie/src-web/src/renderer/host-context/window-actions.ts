import { defineInvoke } from '@moeru/eventa'
import { electron } from '@proj-airi/electron-eventa'
import { shallowRef } from 'vue'

import { electronCenterMainWindow, electronStartDraggingWindow, electronWindowSetAlwaysOnTop } from '../../shared/eventa'
import { initializeHostContext } from './owner'

export function useHostAlwaysOnTop() {
  const host = initializeHostContext()
  return host.runtime === 'kirie'
    ? host.platform!.hostWindow.setAlwaysOnTop
    : defineInvoke(host.context, electronWindowSetAlwaysOnTop)
}

export function useHostWindowCenter() {
  const host = initializeHostContext()
  return host.runtime === 'kirie'
    ? host.platform!.hostWindow.centerOnCurrentDisplay
    : defineInvoke(host.context, electronCenterMainWindow)
}

export function useHostWindowMove() {
  const host = initializeHostContext()
  const isNativeMoveSupported = shallowRef(host.runtime === 'kirie')
  const usesCssDragRegion = shallowRef(false)
  const startElectronMove = host.runtime === 'electron'
    ? defineInvoke(host.context, electronStartDraggingWindow)
    : undefined

  if (host.runtime === 'electron') {
    defineInvoke(host.context, electron.app.isLinux)()
      .then((isLinux) => {
        isNativeMoveSupported.value = !isLinux
        usesCssDragRegion.value = isLinux
      })
      .catch(error => console.error('[host-context] Failed to detect Electron window move support.', error))
  }

  async function beginMove() {
    if (!isNativeMoveSupported.value)
      return

    if (host.runtime === 'kirie') {
      await host.platform!.hostWindow.beginMove()
      return
    }

    await startElectronMove!()
  }

  return {
    beginMove,
    isNativeMoveSupported,
    usesCssDragRegion,
  }
}
