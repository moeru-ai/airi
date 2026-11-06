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
  rawMessage?: string
  cause?: unknown
}

/** Error thrown when computer use execution fails, preserving execution state and context. */
export class ComputerUseExecutionError extends Error {
  readonly executionState: ExecutionState
  readonly argv?: readonly string[]
  readonly exitCode?: number
  readonly stderr?: string
  readonly rawMessage: string

  constructor(message: string, details: ComputerUseErrorDetails) {
    super(message, { cause: details })
    this.name = 'ComputerUseExecutionError'
    this.rawMessage = details.rawMessage ?? message.replace(/^\[executionState:\s*\w+\]\s*/, '')
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
      rawMessage: this.rawMessage,
      executionState: this.executionState,
      argv: this.argv,
      exitCode: this.exitCode,
      stderr: this.stderr,
    }
  }
}

/** Resolves structured error details from an error or error-like object, including across structured clone. */
export function extractErrorDetails(error: unknown): ComputerUseErrorDetails {
  const direct = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  const cause = (direct && 'cause' in direct && direct.cause && typeof direct.cause === 'object')
    ? (direct.cause as Record<string, unknown>)
    : undefined

  const executionState = (typeof direct?.executionState === 'string'
    ? direct.executionState
    : typeof cause?.executionState === 'string'
      ? cause.executionState
      : undefined) as ExecutionState | undefined

  const exitCode = typeof direct?.exitCode === 'number'
    ? direct.exitCode
    : typeof cause?.exitCode === 'number'
      ? cause.exitCode
      : typeof direct?.code === 'number'
        ? direct.code
        : typeof cause?.code === 'number'
          ? cause.code
          : undefined

  const stderr = typeof direct?.stderr === 'string'
    ? direct.stderr
    : typeof cause?.stderr === 'string'
      ? cause.stderr
      : undefined

  const argv = Array.isArray(direct?.argv)
    ? direct.argv as readonly string[]
    : Array.isArray(cause?.argv)
      ? cause.argv as readonly string[]
      : undefined

  const rawMessage = typeof direct?.rawMessage === 'string'
    ? direct.rawMessage
    : typeof cause?.rawMessage === 'string'
      ? cause.rawMessage
      : undefined

  return {
    executionState: executionState ?? 'not_executed',
    argv,
    exitCode,
    stderr,
    rawMessage,
    cause: error,
  }
}

/** Resolves execution state from an error or error-like object. Defaults to not_executed. */
export function extractExecutionState(error: unknown): ExecutionState {
  return extractErrorDetails(error).executionState
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
