import type { IpcRenderer } from '@electron-toolkit/preload'

import type { DockConfig, DockDebugState, StartDockRequest, WindowTargetSummary } from '..'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'

import { windowDock } from '..'

export function useElectronWindowDock(ipcRenderer: IpcRenderer) {
  const context = createContext(ipcRenderer).context

  const listTargets = defineInvoke(context, windowDock.listTargets)
  const startDock = defineInvoke(context, windowDock.start)
  const stopDock = defineInvoke(context, windowDock.stop)
  const getDebugState = defineInvoke(context, windowDock.getDebugState)
  const setConfig = defineInvoke(context, windowDock.setConfig)

  async function fetchTargets(): Promise<WindowTargetSummary[]> {
    return listTargets()
  }

  async function beginDock(payload: StartDockRequest): Promise<DockDebugState> {
    return startDock(payload)
  }

  async function endDock(): Promise<DockDebugState> {
    return stopDock()
  }

  async function updateConfig(config: DockConfig): Promise<DockDebugState> {
    return setConfig(config)
  }

  async function readDebugState(): Promise<DockDebugState> {
    return getDebugState()
  }

  return {
    fetchTargets,
    beginDock,
    endDock,
    updateConfig,
    readDebugState,
  }
}
