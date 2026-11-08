import type { createContext, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'
import type { WebContents } from 'electron'

import type { ComputerUseRuntimeOptions } from './runtime'

import { join, sep } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { computerUseCancel, ComputerUseExecutionError, computerUsePreviewImage, computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { PendingActionManager } from './action-manager'
import { validateAttribution } from './attribution'
import { classifyAuvCommand } from './classifier'
import { createComputerUseRuntime } from './runtime'

/** Registers host-owned computer use. The executable is resolved only on the first call. */
export function setupComputerUse(
  context: ReturnType<typeof createContext>['context'],
  options?: Partial<ComputerUseRuntimeOptions>,
) {
  let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
  const actionManager = options?.actionManager ?? new PendingActionManager()
  let stopped = false
  const observedSenders = new WeakSet<WebContents>()
  function caller(options?: Partial<ElectronMainEmitOptions>): number {
    if (stopped)
      throw new Error('Computer use has stopped.')
    const sender = options?.raw?.ipcMainEvent.sender
    if (!sender || sender.isDestroyed() || !Number.isSafeInteger(sender.id) || sender.id <= 0)
      throw new Error('Computer use requires a verified Electron sender.')
    if (!observedSenders.has(sender)) {
      observedSenders.add(sender)
      sender.once('destroyed', () => actionManager.cancelBySender(sender.id))
    }
    return sender.id
  }
  function getRuntime() {
    if (stopped)
      throw new Error('Computer use has stopped.')
    if (!runtime) {
      const executable = binaryPath()
      runtime = createComputerUseRuntime({
        // Native executables cannot run inside Electron's archive.
        binaryPath: options?.binaryPath ?? (app.isPackaged ? executable.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`) : executable),
        storeRoot: options?.storeRoot ?? join(app.getPath('userData'), 'computer-use'),
        actionManager,
        requireAttribution: options?.requireAttribution ?? true,
      })
    }
    return runtime
  }
  defineInvokeHandler(context, computerUseRun, (input, ctx) => {
    const sender = caller(ctx)
    const command = classifyAuvCommand(input.argv)
    // No trusted grant exists yet. AUV 0.0.40 cannot bind capture to an expected window lifecycle.
    // Reject every native observation before the queue or daemon. Help never observes a window.
    if (command.category === 'read_only' && !command.isHelp)
      throw new ComputerUseExecutionError('A trusted observation scope is required. Native observation is unavailable until window lifecycle binding is supported.', { executionState: 'not_executed', argv: input.argv })
    return getRuntime().run(input, sender, ctx?.abortController?.signal)
  })
  defineInvokeHandler(context, computerUseReadImage, (_input, ctx) => {
    caller(ctx)
    throw new ComputerUseExecutionError('A trusted observation scope and capture provenance are required to read an image.', { executionState: 'not_executed' })
  })
  defineInvokeHandler(context, computerUsePreviewImage, (_input, ctx) => {
    caller(ctx)
    throw new ComputerUseExecutionError('A trusted observation scope and capture provenance are required to preview an image.', { executionState: 'not_executed' })
  })
  defineInvokeHandler(context, computerUseCancel, (input, ctx) => {
    const attribution = validateAttribution(input.attribution, caller(ctx))
    if (!attribution.turnId)
      throw new Error('Cancelling computer use requires the original turn ID.')
    return actionManager.cancelInvocation(attribution, input.reason)
  })
  onAppBeforeQuit(async () => {
    stopped = true
    actionManager.invalidateAll()
    await runtime?.dispose()
  })

  return {
    actionManager,
    getRuntime,
  }
}
