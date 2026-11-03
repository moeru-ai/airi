import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ComputerUseRuntimeOptions } from './runtime'

import { join, sep } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { PendingActionManager } from './action-manager'
import { createComputerUseRuntime } from './runtime'

/** Registers host-owned computer use. The executable is resolved only on the first call. */
export function setupComputerUse(
  context: ReturnType<typeof createContext>['context'],
  options?: Partial<ComputerUseRuntimeOptions>,
) {
  let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
  const actionManager = options?.actionManager ?? new PendingActionManager()
  let stopped = false
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
        authorizeMutation: options?.authorizeMutation,
      })
    }
    return runtime
  }
  defineInvokeHandler(context, computerUseRun, (input, ctx) => {
    const senderId = (ctx as { raw?: { ipcMainEvent?: { sender?: { id?: number } } } })?.raw?.ipcMainEvent?.sender?.id
    return getRuntime().run(input, senderId)
  })
  defineInvokeHandler(context, computerUseReadImage, (input, ctx) => {
    const senderId = (ctx as { raw?: { ipcMainEvent?: { sender?: { id?: number } } } })?.raw?.ipcMainEvent?.sender?.id
    return getRuntime().readImage(input, senderId)
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
