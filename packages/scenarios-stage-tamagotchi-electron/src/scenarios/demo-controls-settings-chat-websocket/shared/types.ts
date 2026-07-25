import type { VishotArtifact } from '@vishot/source-electron'

import type { StageTamagotchiScenarioContext } from '../../../context.ts'

export type ManualSectionId = 'overview' | 'settings' | 'devtools'
export type ManualCaptureStepKind = 'main-window' | 'controls-island' | 'chat-window' | 'settings-overview' | 'settings-route' | 'connection'
export type StageWindowSnapshotLike = Awaited<ReturnType<StageTamagotchiScenarioContext['stageWindows']['waitFor']>>

export interface ManualCaptureStep {
  docAssetFileName: string
  id: string
  kind: ManualCaptureStepKind
  rawCaptureName: string
  readyPattern?: RegExp
  routePath?: string
  waitMs?: number
}

export interface ManualCaptureSection {
  id: ManualSectionId
  label: string
  steps: ManualCaptureStep[]
}

export interface ManualRuntime {
  chatWindowSnapshot?: StageWindowSnapshotLike
  context: StageTamagotchiScenarioContext
  mainWindow: StageWindowSnapshotLike
  settingsWindowSnapshot?: StageWindowSnapshotLike
}

export interface CaptureExecutionResult {
  artifacts: VishotArtifact[]
}
