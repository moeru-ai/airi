import type { ElectronApplication, Page } from 'playwright'

import type { StageWindowName, StageWindowSnapshot } from '../utils/windows'

export interface CaptureOptions {
  fullPage?: boolean
}

export interface StageWindowsApi {
  waitFor: (name: StageWindowName, timeout?: number) => Promise<StageWindowSnapshot>
}

export interface ControlsIslandApi {
  expand: (page: Page) => Promise<void>
  openSettings: (page: Page) => Promise<StageWindowSnapshot>
  openChat: (page: Page) => Promise<StageWindowSnapshot>
  openHearing: (page: Page) => Promise<Page>
}

export interface SettingsWindowApi {
  waitFor: (timeout?: number) => Promise<StageWindowSnapshot>
  goToConnection: (page: Page) => Promise<Page>
}

export interface DialogsApi {
  dismiss: (page: Page) => Promise<void>
}

export interface DrawersApi {
  swipeDown: (page: Page) => Promise<void>
  dismiss: (page: Page) => Promise<void>
}

export interface ScenarioContext {
  electronApp: ElectronApplication
  outputDir: string
  capture: (name: string, page: Page, options?: CaptureOptions) => Promise<string>
  stageWindows: StageWindowsApi
  controlsIsland: ControlsIslandApi
  settingsWindow: SettingsWindowApi
  dialogs: DialogsApi
  drawers: DrawersApi
}

export interface StageTamagotchiScenario {
  id: string
  run: (context: ScenarioContext) => Promise<void>
}
