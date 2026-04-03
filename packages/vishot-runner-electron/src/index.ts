export { capturePage } from './runtime/capture'
export { createScenarioContext } from './runtime/context'
export { defineScenario } from './runtime/define-scenario'
export { loadScenarioModule } from './runtime/load-scenario'
export type { LoadedScenarioModule } from './runtime/load-scenario'
export type {
  CaptureOptions,
  ControlsIslandApi,
  DialogsApi,
  DrawersApi,
  ElectronScenario,
  ScenarioContext,
  SettingsWindowApi,
  StageWindowsApi,
} from './runtime/types'
export { resolveElectronAppInfo } from './utils/app-path'
export type { ElectronAppInfo } from './utils/app-path'
