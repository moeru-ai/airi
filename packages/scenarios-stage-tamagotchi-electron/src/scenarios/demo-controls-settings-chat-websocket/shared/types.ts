import type { ScenarioContext, VishotArtifact } from '@proj-airi/vishot-runner-electron'

export type ManualSectionId = 'overview' | 'settings' | 'devtools'
export type ManualCaptureStepKind = 'main-window' | 'controls-island' | 'chat-window' | 'settings-overview' | 'settings-route' | 'connection'
export type StageWindowSnapshotLike = Awaited<ReturnType<ScenarioContext['stageWindows']['waitFor']>>

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
  context: ScenarioContext
  mainWindow: StageWindowSnapshotLike
  settingsWindowSnapshot?: StageWindowSnapshotLike
}

export interface CaptureExecutionResult {
  artifacts: VishotArtifact[]
}
