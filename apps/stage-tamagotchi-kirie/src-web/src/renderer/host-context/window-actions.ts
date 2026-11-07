import { shallowRef } from 'vue'

import { initializeHostContext } from './owner'

export function useHostAlwaysOnTop() {
  return initializeHostContext().platform.hostWindow.setAlwaysOnTop
}

export function useHostWindowCenter() {
  return initializeHostContext().platform.hostWindow.centerOnCurrentDisplay
}

export function useHostWindowMove() {
  const host = initializeHostContext()
  const isNativeMoveSupported = shallowRef(true)
  const usesCssDragRegion = shallowRef(false)

  return {
    beginMove: host.platform.hostWindow.beginMove,
    isNativeMoveSupported,
    usesCssDragRegion,
  }
}

/** Starts a native resize from one edge or corner. Call it on the press of a resize handle. */
export function useHostWindowResize() {
  return initializeHostContext().platform.hostWindow.beginResize
}
