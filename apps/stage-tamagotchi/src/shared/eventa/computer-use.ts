import { defineInvokeEventa } from '@moeru/eventa'

/** Request correlation supplied by application code, never by model arguments. It does not authenticate a renderer. */
export interface InvocationAttributionPayload {
  sessionId: string
  turnId?: string
  toolCallId?: string
}

/** Input payload for computer_use IPC execution */
export interface ComputerUseRunInput {
  argv: string[]
  actionId?: string
  attribution?: InvocationAttributionPayload
}

/** Input payload for computer_use_read_image IPC */
export interface ComputerUseReadImageInput {
  path: string
  attribution?: InvocationAttributionPayload
}

/** Underlying execution state of a computer use command. */
export type ExecutionState = 'not_executed' | 'executed' | 'unknown'

/** Structured error details for computer use failures across process boundaries. */
export interface ComputerUseErrorDetails {
  executionState: ExecutionState
  argv?: readonly string[]
  exitCode?: number
  stderr?: string
  cause?: unknown
}

/** Error thrown when computer use execution fails, preserving execution state and context. */
export class ComputerUseExecutionError extends Error {
  readonly executionState: ExecutionState
  readonly argv?: readonly string[]
  readonly exitCode?: number
  readonly stderr?: string

  constructor(message: string, details: ComputerUseErrorDetails) {
    super(message, { cause: details })
    this.name = 'ComputerUseExecutionError'
    this.executionState = details.executionState
    this.argv = details.argv
    this.exitCode = details.exitCode
    this.stderr = details.stderr
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      executionState: this.executionState,
      argv: this.argv,
      exitCode: this.exitCode,
      stderr: this.stderr,
    }
  }
}

/** Resolves execution state from an error or error-like object. Defaults to not_executed. */
export function extractExecutionState(error: unknown): ExecutionState {
  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>
    if ('executionState' in errorRecord && typeof errorRecord.executionState === 'string') {
      return errorRecord.executionState as ExecutionState
    }
    if ('cause' in errorRecord && errorRecord.cause && typeof errorRecord.cause === 'object') {
      const causeRecord = errorRecord.cause as Record<string, unknown>
      if (typeof causeRecord.executionState === 'string') {
        return causeRecord.executionState as ExecutionState
      }
    }
  }
  return 'not_executed'
}

/** AUV invocation result. A zero exit code does not verify the requested UI effect. */
export interface ComputerUseResult {
  argv: string[]
  exitCode: number
  output: unknown
  stderr: string
  executionState: ExecutionState
}

export interface ComputerUseCancelInput {
  attribution: InvocationAttributionPayload
  reason?: string
}

/** Local history previews share the host artifact store and do not represent a model tool invocation. */
export type ComputerUsePreviewImageInput = Pick<ComputerUseReadImageInput, 'path'>

export const computerUseRun = defineInvokeEventa<ComputerUseResult, ComputerUseRunInput>('eventa:invoke:computer-use:run')
export const computerUseReadImage = defineInvokeEventa<string, ComputerUseReadImageInput>('eventa:invoke:computer-use:read-image')
export const computerUsePreviewImage = defineInvokeEventa<string, ComputerUsePreviewImageInput>('eventa:invoke:computer-use:preview-image')
export const computerUseCancel = defineInvokeEventa<number, ComputerUseCancelInput>('eventa:invoke:computer-use:cancel')

/**
 * Whether an AUV call asks for help. AUV prints help as text, so the host runs it without `--json`, and the chat shows it as help.
 *
 * @example
 * isComputerUseHelpCall(['invoke', 'input.keys', '-h'])
 * // => true
 */
export function isComputerUseHelpCall(argv: readonly string[]) {
  return argv.includes('--help') || argv.includes('-h') || argv[1] === 'help'
}
