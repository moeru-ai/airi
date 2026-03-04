export { useElectronAllDisplays } from './composables/use-electron-all-displays'
export { useElectronAutoUpdater } from './composables/use-electron-auto-updater'
export {
  getElectronEventaContext,
  resetElectronEventaContextForTesting,
  useElectronEventaContext,
  useElectronEventaInvoke,
} from './composables/use-electron-eventa-context'
export { useElectronMouse, useElectronMouseEventTarget } from './composables/use-electron-mouse'
export { useElectronMouseAroundWindowBorder } from './composables/use-electron-mouse-around-window-border'
export type { UseMouseInElementReturn } from './composables/use-electron-mouse-in-element'
export { useElectronMouseInElement } from './composables/use-electron-mouse-in-element'
export { useElectronMouseInWindow } from './composables/use-electron-mouse-in-window'
export { useElectronRelativeMouse } from './composables/use-electron-relative-mouse'
export { useElectronWindowBounds } from './composables/use-electron-window-bounds'
export { useElectronWindowResize } from './composables/use-electron-window-resize'

export {
  createRendererLoop,
  isRendererUnavailable,
  shouldStopForRendererError,
  stopLoopWhenRendererIsGone,
  useLoop,
} from './main'
export type { LoopOptions } from './main'
