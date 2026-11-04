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

/** AUV invocation result. A zero exit code does not verify the requested UI effect. */
export interface ComputerUseResult {
  argv: string[]
  exitCode: number
  output: unknown
  stderr: string
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
