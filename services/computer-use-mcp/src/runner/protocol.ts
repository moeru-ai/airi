import type {
  ClickActionInput,
  DisplayInfo,
  DisplaySize,
  ExecutionTarget,
  ExecutorActionResult,
  PermissionInfo,
  PointerTracePoint,
  PressKeysActionInput,
  ScreenshotRequest,
  ScrollActionInput,
  TestTargetLaunchResult,
  TypeTextActionInput,
  WaitActionInput,
} from '../types'

export interface RunnerActionResult extends ExecutorActionResult {
  executionTarget: ExecutionTarget
}

export interface RunnerErrorResponse {
  error: {
    code?: string
    message: string
  }
  id: string
  ok: false
}

export interface RunnerInitializeParams {
  displaySize: DisplaySize
  observationBaseUrl?: string
  observationServePort?: number
  observationToken?: string
  sessionTag?: string
}

export interface RunnerInitializeResult {
  displayInfo: DisplayInfo
  executionTarget: ExecutionTarget
  permissionInfo: PermissionInfo
}

export type RunnerMethod
  = | 'click'
    | 'getDisplayInfo'
    | 'getExecutionTarget'
    | 'getForegroundContext'
    | 'getPermissionInfo'
    | 'initialize'
    | 'openTestTarget'
    | 'pressKeys'
    | 'scroll'
    | 'shutdown'
    | 'takeScreenshot'
    | 'typeText'
    | 'wait'

export type RunnerOpenTestTargetResult = TestTargetLaunchResult

export interface RunnerRequest {
  id: string
  method: RunnerMethod
  params?: RunnerRequestParams
}

export type RunnerRequestParams
  = | (ClickActionInput & { pointerTrace: PointerTracePoint[] })
    | PressKeysActionInput
    | Record<string, never>
    | RunnerInitializeParams
    | ScreenshotRequest
    | ScrollActionInput
    | TypeTextActionInput
    | WaitActionInput

export type RunnerResponse<Result = unknown> = RunnerErrorResponse | RunnerSuccessResponse<Result>

export interface RunnerScreenshotResult {
  dataBase64: string
  executionTarget: ExecutionTarget
  height?: number
  mimeType: 'image/png'
  note?: string
  publicUrl?: string
  width?: number
}

export interface RunnerSuccessResponse<Result = unknown> {
  id: string
  ok: true
  result: Result
}
