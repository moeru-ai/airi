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

export type RunnerMethod
  = | 'initialize'
    | 'getExecutionTarget'
    | 'getDisplayInfo'
    | 'getForegroundContext'
    | 'getPermissionInfo'
    | 'takeScreenshot'
    | 'click'
    | 'typeText'
    | 'pressKeys'
    | 'scroll'
    | 'wait'
    | 'openTestTarget'
    | 'shutdown'

export interface RunnerInitializeParams {
  sessionTag?: string
  displaySize: DisplaySize
  observationBaseUrl?: string
  observationServePort?: number
  observationToken?: string
}

export interface RunnerInitializeResult {
  executionTarget: ExecutionTarget
  displayInfo: DisplayInfo
  permissionInfo: PermissionInfo
}

export interface RunnerScreenshotResult {
  dataBase64: string
  mimeType: 'image/png'
  publicUrl?: string
  width?: number
  height?: number
  note?: string
  executionTarget: ExecutionTarget
}

export type RunnerOpenTestTargetResult = TestTargetLaunchResult

export interface RunnerActionResult extends ExecutorActionResult {
  executionTarget: ExecutionTarget
}

export type RunnerRequestParams
  = | RunnerInitializeParams
    | ScreenshotRequest
    | (ClickActionInput & { pointerTrace: PointerTracePoint[] })
    | TypeTextActionInput
    | PressKeysActionInput
    | ScrollActionInput
    | WaitActionInput
    | Record<string, never>

export interface RunnerRequest {
  id: string
  method: RunnerMethod
  params?: RunnerRequestParams
}

export interface RunnerSuccessResponse<Result = unknown> {
  id: string
  ok: true
  result: Result
}

export interface RunnerErrorResponse {
  id: string
  ok: false
  error: {
    message: string
    code?: string
  }
}

export type RunnerResponse<Result = unknown> = RunnerSuccessResponse<Result> | RunnerErrorResponse
