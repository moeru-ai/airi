import { defineInvokeEventa } from '@moeru/eventa'

/** AUV invocation result. A zero exit code does not verify the requested UI effect. */
export interface ComputerUseResult {
  argv: string[]
  exitCode: number
  output: unknown
  stderr: string
}

export const computerUseRun = defineInvokeEventa<ComputerUseResult, { argv: string[] }>('eventa:invoke:computer-use:run')
export const computerUseReadImage = defineInvokeEventa<string, { path: string }>('eventa:invoke:computer-use:read-image')

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
