import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import type { DockConfig, DockDebugState, StartDockRequest, WindowTargetSummary } from '.'

import { defineInvoke } from '@moeru/eventa'

import { windowDock } from '.'

export { defaultDockConfig } from '.'

export interface WindowDockClient {
  listTargets: () => Promise<WindowTargetSummary[]>
  startDock: (payload: StartDockRequest) => Promise<DockDebugState>
  stopDock: () => Promise<DockDebugState>
  getDebugState: () => Promise<DockDebugState>
  setConfig: (config: DockConfig) => Promise<DockDebugState>
}

export function setupElectronWindowDock(context: ReturnType<typeof createContext>['context']): WindowDockClient {
  const listTargets = defineInvoke(context, windowDock.listTargets)
  const startDock = defineInvoke(context, windowDock.start)
  const stopDock = defineInvoke(context, windowDock.stop)
  const getDebugState = defineInvoke(context, windowDock.getDebugState)
  const setConfig = defineInvoke(context, windowDock.setConfig)

  return {
    listTargets,
    startDock,
    stopDock,
    getDebugState,
    setConfig,
  }
}
