import type { VishotArtifact } from '@vishot/source-electron'

import type { StageTamagotchiScenarioContext } from '../../../context'

export interface CaptureExecutionResult {
  artifacts: VishotArtifact[]
}
export interface ManualCaptureSection {
  id: ManualSectionId
  label: string
  steps: ManualCaptureStep[]
}
export interface ManualCaptureStep {
  docAssetFileName: string
  id: string
  kind: ManualCaptureStepKind
  rawCaptureName: string
  readyPattern?: RegExp
  routePath?: string
  waitMs?: number
}

export type ManualCaptureStepKind = 'chat-window' | 'connection' | 'controls-island' | 'main-window' | 'settings-overview' | 'settings-route'

export interface ManualRuntime {
  chatWindowSnapshot?: StageWindowSnapshotLike
  context: StageTamagotchiScenarioContext
  mainWindow: StageWindowSnapshotLike
  settingsWindowSnapshot?: StageWindowSnapshotLike
}

export type ManualSectionId = 'devtools' | 'overview' | 'settings'

export type StageWindowSnapshotLike = Awaited<ReturnType<StageTamagotchiScenarioContext['stageWindows']['waitFor']>>
