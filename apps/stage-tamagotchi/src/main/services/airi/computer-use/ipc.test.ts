import type { ComputerUseReadImageInput, ComputerUseResult, ComputerUseRunInput } from '../../../../shared/eventa/computer-use'
import type { PendingActionManager } from './action-manager'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvoke } from '@moeru/eventa'
import { createContext as createMainContext } from '@moeru/eventa/adapters/electron/main'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { emitAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { setupComputerUse } from './index'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  isPackaged: false,
}))

const sdkMock = vi.hoisted(() => ({
  startAuv: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
}))

vi.mock('@auv-js/sdk/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@auv-js/sdk/node')>()
  return {
    ...actual,
    startAuv: (...args: Parameters<typeof actual.startAuv>) => {
      sdkMock.startAuv(...args)
      return {
        connectionOptions: { credential: 'test-launcher-token' },
        endpoints: ['ipc://test-unavailable-auv'],
        exited: new Promise(() => {}),
        stop: vi.fn(),
      }
    },
  }
})

describe('computer use Electron Main IPC host enforcement gate & attribution contract', () => {
  let directory: string
  let storeRoot: string
  let ipcMain: EventEmitter
  let actionManager: PendingActionManager
  let runViaIpc: (input: ComputerUseRunInput) => Promise<ComputerUseResult>
  let readImageViaIpc: (input: ComputerUseReadImageInput) => Promise<string>
  let senderWebContentsId: number

  function origin(sessionId: string) {
    return { sessionId, turnId: 'turn-a', toolCallId: 'call-a', senderWebContentsId }
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    directory = await mkdtemp(join(tmpdir(), 'airi-cu-ipc-test-'))
    storeRoot = join(directory, 'store')
    await mkdir(storeRoot)
    appMock.getPath.mockReturnValue(storeRoot)

    // In-memory Electron IPC Main event bus
    ipcMain = new EventEmitter()
    const { context: mainContext } = createMainContext(ipcMain as never)

    // Register host-owned computer-use with test directory
    const registered = setupComputerUse(mainContext, {
      binaryPath: binaryPath(),
      storeRoot,
      requireAttribution: true,
    })
    actionManager = registered.actionManager

    // Simulated renderer process context
    const { context: rendererContext, window } = createWindowIpc(ipcMain)
    senderWebContentsId = window.webContents.id
    runViaIpc = defineInvoke(rendererContext, computerUseRun)
    readImageViaIpc = defineInvoke(rendererContext, computerUseReadImage)
  })

  afterEach(async () => {
    await emitAppBeforeQuit()
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects mutating commands when actionId is missing (Fail-Closed) and executes zero CLI processes', async () => {
    await expect(runViaIpc({
      argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'],
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      'Mutating desktop operation \'input.clickPoint\' requires an approved action (actionId missing).',
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects desktop observation when attribution is missing (Fail-Closed)', async () => {
    // Un-attributed desktop observation must fail closed
    await expect(runViaIpc({
      argv: ['invoke', 'window.list'],
    })).rejects.toThrow(
      'Invocation attribution is required (missing sessionId).',
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects when attribution contains empty or invalid sessionId', async () => {
    await expect(runViaIpc({
      argv: ['invoke', 'window.list'],
      attribution: { sessionId: '   ' },
    })).rejects.toThrow(
      'Invalid invocation attribution: sessionId must be a non-empty string.',
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects unapproved pending actions and executes zero CLI processes', async () => {
    const action = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'],
    })

    await expect(runViaIpc({
      argv: [...action.argv],
      actionId: action.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      `Pending action '${action.id}' has not been approved.`,
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects cancelled actions and executes zero CLI processes', async () => {
    const action = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'],
    })
    actionManager.cancel(action.id, 'Task cancelled by user')

    await expect(runViaIpc({
      argv: [...action.argv],
      actionId: action.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      `Pending action '${action.id}' was cancelled.`,
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects expired actions when TTL has elapsed', async () => {
    const action = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'],
      ttlMs: 5, // 5ms TTL
    })
    actionManager.approve(action.id)

    // Wait for action to expire
    await new Promise(resolve => setTimeout(resolve, 15))

    await expect(runViaIpc({
      argv: [...action.argv],
      actionId: action.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      `Pending action '${action.id}' has expired.`,
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('rejects parameter changes: approved action cannot be reused with altered parameters', async () => {
    const action = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'],
    })
    actionManager.approve(action.id)

    // Attacker or caller attempts to alter coordinates while reusing actionId
    await expect(runViaIpc({
      argv: ['invoke', 'input.clickPoint', '999', '999', '--target', 'app:notepad'],
      actionId: action.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      `Pending action '${action.id}' parameter mismatch: approved arguments do not match requested execution arguments.`,
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('enforces single-use atomic consumption: duplicate execution attempt is rejected', async () => {
    const mutatingAction = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'app.activate', 'Calculator'],
    })
    actionManager.approve(mutatingAction.id)

    // Execute first time: consumes action
    const firstResult = await runViaIpc({
      argv: [...mutatingAction.argv],
      actionId: mutatingAction.id,
      attribution: origin('session-alpha'),
    })
    expect(firstResult).toBeDefined()
    expect(sdkMock.startAuv).toHaveBeenCalledTimes(1)

    // Second execution with identical actionId must be rejected as already consumed
    await expect(runViaIpc({
      argv: [...mutatingAction.argv],
      actionId: mutatingAction.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      `Pending action '${mutatingAction.id}' has already been consumed (replay rejected).`,
    )
    // No second CLI start was triggered
    expect(sdkMock.startAuv).toHaveBeenCalledTimes(1)
  })

  it('isolates concurrent sessions: Session A cannot consume an action authorized for Session B', async () => {
    const actionA = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'app.activate', 'TextEdit'],
    })
    const actionB = actionManager.createPendingAction({
      attribution: origin('session-beta'),
      argv: ['invoke', 'app.activate', 'Terminal'],
    })

    actionManager.approve(actionA.id)
    actionManager.approve(actionB.id)

    // Cross-session attempt: Session Alpha attempts to consume Action B
    await expect(runViaIpc({
      argv: [...actionB.argv],
      actionId: actionB.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      `Pending action '${actionB.id}' attribution mismatch: action was authorized for session 'session-beta', but requested by session 'session-alpha'.`,
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()

    // Proper attribution consumes successfully
    const resultB = await runViaIpc({
      argv: [...actionB.argv],
      actionId: actionB.id,
      attribution: origin('session-beta'),
    })
    expect(resultB).toBeDefined()
    expect(sdkMock.startAuv).toHaveBeenCalledTimes(1)
  })

  it('conservative precondition: rejects unbound foreground input mutations without explicit target', async () => {
    // Unbound input.typeText without --target
    const unboundAction = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'input.typeText', 'dangerous text'],
    })
    actionManager.approve(unboundAction.id)

    await expect(runViaIpc({
      argv: [...unboundAction.argv],
      actionId: unboundAction.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow(
      'Precondition failed: Mutating operation \'input.typeText\' is rejected: operation is unbound from an explicit target window or app (--target is required).',
    )
    expect(sdkMock.startAuv).not.toHaveBeenCalled()
  })

  it('does NOT block read-only operations while an approval action is pending', async () => {
    // Create an action that stays pending
    const pendingAction = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'app.activate', 'Notepad'],
    })
    expect(actionManager.get(pendingAction.id)?.status).toBe('pending')

    // Concurrently, a read-only request is dispatched
    const helpResult = await runViaIpc({
      argv: ['invoke', 'window.list', '--help'],
      attribution: origin('session-alpha'),
    })

    expect(helpResult.exitCode).toBe(0)
    expect(helpResult.output).toContain('window.list')

    // The pending action is still untouched and pending
    expect(actionManager.get(pendingAction.id)?.status).toBe('pending')
  })

  it('invalidates all pending and approved actions on host shutdown', async () => {
    const action = actionManager.createPendingAction({
      attribution: origin('session-alpha'),
      argv: ['invoke', 'app.activate', 'Notepad'],
    })
    actionManager.approve(action.id)

    // Host shutdown emitted
    await emitAppBeforeQuit()

    // Action has been invalidated
    expect(actionManager.get(action.id)?.status).toBe('cancelled')

    // Subsequent invocation rejected
    await expect(runViaIpc({
      argv: [...action.argv],
      actionId: action.id,
      attribution: origin('session-alpha'),
    })).rejects.toThrow('Computer use has stopped.')
  })

  it('preserves screenshot reading and enforces attribution on image reads', async () => {
    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64')
    const screenshotPath = join(storeRoot, 'shot.png')
    await writeFile(screenshotPath, imageBytes)

    // 1. Without attribution: rejected
    await expect(readImageViaIpc({ path: screenshotPath })).rejects.toThrow(
      'Invocation attribution is required (missing sessionId).',
    )

    // 2. With valid attribution: succeeds
    const dataUrl = await readImageViaIpc({
      path: screenshotPath,
      attribution: origin('session-alpha'),
    })
    expect(dataUrl).toBe(`data:image/png;base64,${imageBytes.toString('base64')}`)
  })
})
