import type { ForegroundContext } from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { appNamesMatch } from '../app-aliases'

export async function assertApprovedForeground(
  runtime: ComputerUseServerRuntime,
  approved: ForegroundContext | undefined,
): Promise<void> {
  if (!approved?.available || !approved.appName?.trim())
    return

  const current = await runtime.executor.getForegroundContext()
  if (!current.available || !appNamesMatch(current.appName, approved.appName))
    throw new Error('The foreground application changed before input.')

  const approvedTitle = approved.windowTitle?.trim() ?? ''
  if (approvedTitle && (current.windowTitle?.trim() ?? '') !== approvedTitle)
    throw new Error('The foreground window changed before input.')
}
