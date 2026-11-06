import type { ExecFileOptions } from 'node:child_process'

import type { ComputerUseToolExecuteOptions } from '../../../../renderer/stores/tools/builtin/computer-use'
import type { ComputerUseRunInput } from '../../../../shared/eventa/computer-use'
import type { InvocationAttribution } from './attribution'

import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { defineInvoke } from '@moeru/eventa'
import { createContext as createMainContext } from '@moeru/eventa/adapters/electron/main'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computerUseTools } from '../../../../renderer/stores/tools/builtin/computer-use'
import { computerUseRun } from '../../../../shared/eventa/computer-use'
import { emitAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { setupComputerUse } from './index'

interface CliResult {
  stdout: string
  stderr: string
}
type CliExecution = Promise<CliResult> & { child: { stdin: PassThrough } }

const external = vi.hoisted(() => ({
  execute: vi.fn<(file: string, args: readonly string[], options: ExecFileOptions) => CliExecution>(),
  start: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...actual, execFile: Object.assign(vi.fn(), { [promisify.custom]: external.execute }) }
})
vi.mock('@auv-js/sdk/node', () => ({ startAuv: external.start }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn() } }))

function execution(result: Promise<CliResult> | CliResult): CliExecution {
  return Object.assign(Promise.resolve(result), { child: { stdin: new PassThrough() } })
}

describe('f-Contract-1: Production Host Execution Result Contract Regression', () => {
  let directory: string
  let storeRoot: string
  let host: ReturnType<typeof setupComputerUse>
  let renderer: ReturnType<typeof createWindowIpc>
  let ipcMain: EventEmitter
  let toolRunner: Awaited<ReturnType<typeof computerUseTools>>[0]
  let runViaIpc: (input: ComputerUseRunInput) => Promise<unknown>

  let physicalSideEffects = 0

  function origin(turnId = 'turn-1'): InvocationAttribution {
    return {
      sessionId: 'session-alpha',
      turnId,
      toolCallId: 'call-1',
      senderWebContentsId: renderer.window.webContents.id,
    }
  }

  function createApprovedAction(argv: string[], attribution = origin()) {
    const action = host.actionManager.createPendingAction({ argv, attribution })
    host.actionManager.approve(action.id)
    return action
  }

  function executeTool(input: unknown, options: Partial<ComputerUseToolExecuteOptions>): Promise<unknown> {
    return Promise.resolve(toolRunner.execute(input, options as never))
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    physicalSideEffects = 0

    directory = await mkdtemp(join(tmpdir(), 'airi-f-contract-test-'))
    storeRoot = join(directory, 'store')
    await mkdir(storeRoot)

    ipcMain = new EventEmitter()
    host = setupComputerUse(createMainContext(ipcMain as never).context, {
      binaryPath: 'test-auv',
      storeRoot,
      requireAttribution: true,
    })
    renderer = createWindowIpc(ipcMain)

    external.start.mockResolvedValue({
      connectionOptions: { credential: 'test-token' },
      endpoints: ['ipc://test-auv'],
      exited: new Promise(() => {}),
      stop: vi.fn(),
    })

    const tools = await computerUseTools({ context: renderer.context })
    toolRunner = tools[0]
    runViaIpc = defineInvoke(renderer.context, computerUseRun)
  })

  afterEach(async () => {
    await emitAppBeforeQuit()
    await rm(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // --------------------------------------------------------------------------
  // Case A: Pre-dispatch Rejection
  // --------------------------------------------------------------------------
  it('case A: Pre-dispatch Rejection (actionId missing) - 0 executor calls, 0 side effects, rejected cleanly', async () => {
    const attribution = origin()
    let rendererError: Error | undefined

    try {
      await executeTool(
        { argv: ['invoke', 'app.activate', 'Calculator'] },
        { attribution, actionId: undefined },
      )
    }
    catch (err) {
      rendererError = err as Error
    }

    expect(external.execute).toHaveBeenCalledTimes(0)
    expect(physicalSideEffects).toBe(0)
    expect(rendererError).toBeDefined()
    expect(rendererError?.message).toContain('requires an approved action (actionId missing)')
    expect((rendererError as any)?.executionState).toBe('not_executed')

    // Record Case A evidence
    console.info('CASE_A_EVIDENCE', JSON.stringify({
      case: 'Case A (Pre-dispatch Rejection)',
      enteredExecutor: false,
      executorCalls: external.execute.mock.calls.length,
      sideEffects: physicalSideEffects,
      hostSettlement: 'N/A (Never consumed)',
      trustedSettlement: true,
      rendererResult: rendererError?.message,
      classification: 'not_executed',
    }))
  })

  // --------------------------------------------------------------------------
  // Case B: Execution Succeeded with Trusted Settlement
  // --------------------------------------------------------------------------
  it('case B: Execution Succeeded - 1 executor call, 1 side effect, outcome: success, exitCode: 0', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    external.execute.mockImplementation(() => {
      physicalSideEffects++
      return execution({ stdout: JSON.stringify({ activated: true }), stderr: '' })
    })

    const toolResult = await executeTool(
      { argv: [...action.argv] },
      { attribution: action.attribution, actionId: action.id },
    )

    const settled = host.actionManager.get(action.id)
    expect(external.execute).toHaveBeenCalledTimes(1)
    expect(physicalSideEffects).toBe(1)
    expect(settled?.status).toBe('consumed')
    expect(settled?.settlement).toMatchObject({
      outcome: 'success',
      exitCode: 0,
    })
    expect(typeof toolResult).toBe('string')
    expect(JSON.parse(toolResult as string)).toMatchObject({
      exitCode: 0,
      output: { activated: true },
    })

    console.info('CASE_B_EVIDENCE', JSON.stringify({
      case: 'Case B (Execution Succeeded)',
      enteredExecutor: true,
      executorCalls: external.execute.mock.calls.length,
      sideEffects: physicalSideEffects,
      hostSettlement: settled?.settlement,
      trustedSettlement: true,
      rendererResult: toolResult,
      classification: 'executed',
    }))
  })

  // --------------------------------------------------------------------------
  // Case C: Side Effect Occurred, Then Result Lost / Timeout / Killed
  // --------------------------------------------------------------------------
  it('case C: Side Effect Occurred + Timeout/Killed - Host must report executionState: unknown', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    external.execute.mockImplementation(() => {
      // Physical side effect happens in native OS before timeout kills process
      physicalSideEffects++
      const timeoutErr = Object.assign(new Error('Command timed out after 120000ms'), {
        killed: true,
        code: null,
        stdout: '',
        stderr: '',
      })
      const child = new PassThrough()
      return Object.assign(Promise.reject(timeoutErr), { child: { stdin: child } }) as CliExecution
    })

    let rendererError: Error | undefined
    try {
      await executeTool(
        { argv: [...action.argv] },
        { attribution: action.attribution, actionId: action.id },
      )
    }
    catch (err) {
      rendererError = err as Error
    }

    const settled = host.actionManager.get(action.id)
    expect(external.execute).toHaveBeenCalledTimes(1)
    expect(physicalSideEffects).toBe(1)
    expect(settled?.status).toBe('consumed')

    // Phase 1 / Phase 4 Assertions:
    // 1. Host must NOT assert that the operation was not executed
    expect((settled?.settlement as any)?.executionState).not.toBe('not_executed')
    // 2. Execution state must explicitly be unknown
    expect((settled?.settlement as any)?.executionState).toBe('unknown')
    expect(settled?.settlement?.outcome).toBe('failed')
    // 3. Renderer must NOT erase unknown
    expect((rendererError as any)?.executionState).toBe('unknown')
    // 4. Model tool result must distinguish unknown from pre-execution rejection
    expect(rendererError).toBeDefined()
    expect(rendererError?.message).toContain('Command timed out after 120000ms')

    console.info('CASE_C_EVIDENCE', JSON.stringify({
      case: 'Case C (Side Effect Occurred + Timeout/Killed)',
      enteredExecutor: true,
      executorCalls: external.execute.mock.calls.length,
      sideEffects: physicalSideEffects,
      hostSettlement: settled?.settlement,
      trustedSettlement: true,
      rendererResult: rendererError?.message,
      classification: 'unknown',
    }))
  })

  // --------------------------------------------------------------------------
  // Case D: Cancelled After Start, Execution Result Indeterminate
  // --------------------------------------------------------------------------
  it('case D: Cancelled After Start - Request abort propagates and host reports executionState: unknown', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    let inFlightStarted: (() => void) | undefined
    const inFlightPromise = new Promise<void>((resolve) => {
      inFlightStarted = resolve
    })

    // Track the signal received by execFileAsync
    let receivedSignal: AbortSignal | undefined

    external.execute.mockImplementation((_file, _args, options) => {
      physicalSideEffects++
      receivedSignal = options.signal
      inFlightStarted?.()

      // When process is killed in-flight due to abort/interruption
      const killedErr = Object.assign(new Error('Command was interrupted in-flight'), {
        killed: true,
        code: null,
      })
      const child = new PassThrough()
      return Object.assign(
        new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(killedErr)
          })
          setTimeout(reject, 50, killedErr)
        }),
        { child: { stdin: child } },
      ) as CliExecution
    })

    const abortController = new AbortController()
    let rendererError: Error | undefined
    const execPromise = executeTool(
      { argv: [...action.argv] },
      { attribution: action.attribution, actionId: action.id, abortSignal: abortController.signal },
    )

    await inFlightPromise
    abortController.abort(new Error('Command was interrupted in-flight'))

    try {
      await execPromise
    }
    catch (err) {
      rendererError = err as Error
    }

    const settled = host.actionManager.get(action.id)
    expect(external.execute).toHaveBeenCalledTimes(1)
    expect(settled?.status).toBe('consumed')

    // Phase 1 / Phase 4 Assertions:
    // 1. Request signal must reach the executor options.signal
    expect(receivedSignal).toBeDefined()
    expect(receivedSignal?.aborted).toBe(true)
    // 2. Physical side effect occurred
    expect(physicalSideEffects).toBe(1)
    // 3. Host must NOT assert false certainty outcome without unknown
    expect((settled?.settlement as any)?.executionState).not.toBe('not_executed')
    expect((settled?.settlement as any)?.executionState).toBe('unknown')
    // 4. Renderer must NOT erase unknown
    expect((rendererError as any)?.executionState).toBe('unknown')

    console.info('CASE_D_EVIDENCE', JSON.stringify({
      case: 'Case D (In-flight Interruption/Cancellation)',
      enteredExecutor: true,
      executorCalls: external.execute.mock.calls.length,
      sideEffects: physicalSideEffects,
      hostSettlement: settled?.settlement,
      trustedSettlement: true,
      rendererResult: rendererError?.message,
      classification: 'unknown',
    }))
  })

  // --------------------------------------------------------------------------
  // Case E: Executor Explicitly Returns Non-zero Exit Code
  // --------------------------------------------------------------------------
  it('case E: Executor Non-zero Exit Code - 1 executor call, 0 side effects, outcome: failed, exitCode: 1 (Trusted Failure)', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'NonExistentApp'])
    external.execute.mockImplementation(() => {
      // Process ran, target not found, exited with code 1
      const cliError = Object.assign(new Error('Command failed: auv invoke app.activate NonExistentApp'), {
        code: 1,
        stdout: '',
        stderr: 'Error: Application "NonExistentApp" not found.',
        killed: false,
      })
      const child = new PassThrough()
      return Object.assign(Promise.reject(cliError), { child: { stdin: child } }) as CliExecution
    })

    let rendererError: Error | undefined
    try {
      await executeTool(
        { argv: [...action.argv] },
        { attribution: action.attribution, actionId: action.id },
      )
    }
    catch (err) {
      rendererError = err as Error
    }

    const settled = host.actionManager.get(action.id)
    expect(external.execute).toHaveBeenCalledTimes(1)
    expect(physicalSideEffects).toBe(0)
    expect(settled?.status).toBe('consumed')
    // Legitimate execution failure: accurately recorded with exitCode: 1
    expect(settled?.settlement).toMatchObject({
      outcome: 'failed',
      exitCode: 1,
      error: 'Error: Application "NonExistentApp" not found.',
    })
    expect(rendererError).toBeDefined()
    expect(rendererError?.message).toContain('exitCode')

    console.info('CASE_E_EVIDENCE', JSON.stringify({
      case: 'Case E (Non-zero Exit Code)',
      enteredExecutor: true,
      executorCalls: external.execute.mock.calls.length,
      sideEffects: physicalSideEffects,
      hostSettlement: settled?.settlement,
      trustedSettlement: true, // Clean failure with verified exitCode
      rendererResult: rendererError?.message,
      classification: 'executed (cleanly failed with exitCode 1)',
    }))
  })

  // --------------------------------------------------------------------------
  // Case F: Error Before Executor Spawn (Daemon Connect Failure)
  // --------------------------------------------------------------------------
  it('case F: Error Before Executor Spawn - 0 executor calls, 0 side effects, action cancelled before dispatch', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    external.start.mockRejectedValue(new Error('Failed to start AUV daemon socket.'))

    let rendererError: Error | undefined
    try {
      await executeTool(
        { argv: [...action.argv] },
        { attribution: action.attribution, actionId: action.id },
      )
    }
    catch (err) {
      rendererError = err as Error
    }

    const settled = host.actionManager.get(action.id)
    expect(external.execute).toHaveBeenCalledTimes(0)
    expect(physicalSideEffects).toBe(0)
    // Pre-dispatch failure: status is cancelled, never consumed
    expect(settled?.status).toBe('cancelled')
    expect(settled?.settlement).toMatchObject({
      outcome: 'failed',
      executionState: 'not_executed',
      error: 'Failed to start AUV daemon socket.',
    })
    expect(rendererError).toBeDefined()
    expect(rendererError?.message).toContain('Failed to start AUV daemon socket.')
    expect((rendererError as any)?.executionState).toBe('not_executed')

    console.info('CASE_F_EVIDENCE', JSON.stringify({
      case: 'Case F (Pre-spawn Failure)',
      enteredExecutor: false,
      executorCalls: external.execute.mock.calls.length,
      sideEffects: physicalSideEffects,
      hostSettlement: settled?.settlement,
      trustedSettlement: true, // Proven not executed before dispatch
      rendererResult: rendererError?.message,
      classification: 'not_executed',
    }))
  })

  // --------------------------------------------------------------------------
  // Case G: Cancelled When Underlying Process Not Yet Settled - Lock Retained
  // --------------------------------------------------------------------------
  it('case G: Cancelled Process In-flight - Execution queue holds serial lock until child closes', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    let action1Running = false
    let action1Closed = false
    let action1Started: (() => void) | undefined
    const action1StartedPromise = new Promise<void>((resolve) => {
      action1Started = resolve
    })

    external.execute.mockImplementation((_file, args, options) => {
      const isAction1 = args.includes('app.activate')
      if (isAction1) {
        action1Running = true
        physicalSideEffects++
        action1Started?.()
        const child = new PassThrough()
        return Object.assign(
          new Promise<CliResult>((_, reject) => {
            options.signal?.addEventListener('abort', () => {
              // Subprocess kill takes 40ms to close
              setTimeout(() => {
                action1Running = false
                action1Closed = true
                reject(Object.assign(new Error('Process terminated by abort'), { killed: true, code: null }))
              }, 40)
            })
          }),
          { child: { stdin: child } },
        ) as CliExecution
      }

      // Action 2: Must execute ONLY AFTER action 1 has completely closed
      expect(action1Running).toBe(false)
      expect(action1Closed).toBe(true)
      return execution({ stdout: JSON.stringify({ windows: [] }), stderr: '' })
    })

    const abortController = new AbortController()
    const action1Promise = executeTool(
      { argv: [...action.argv] },
      { attribution: action.attribution, actionId: action.id, abortSignal: abortController.signal },
    ).catch(err => err as Error)

    await action1StartedPromise
    abortController.abort(new Error('Cancelled by caller'))

    // Action 2 arrives while action 1 was aborted but still settling in background
    const action2Promise = runViaIpc({
      argv: ['invoke', 'window.list'],
      attribution: origin('turn-2'),
    })

    const [action1Result, action2Result] = await Promise.all([action1Promise, action2Promise])

    expect(action1Result).toBeInstanceOf(Error)
    expect((action1Result as any)?.executionState).toBe('unknown')
    expect(action2Result).toMatchObject({
      exitCode: 0,
      executionState: 'executed',
    })
    expect(external.execute).toHaveBeenCalledTimes(2)

    console.info('CASE_G_EVIDENCE', JSON.stringify({
      case: 'Case G (Lock Retained Until Child Closes)',
      enteredExecutor: true,
      action1RunningAtAction2Dispatch: false,
      action1ClosedBeforeAction2Run: true,
      action1ExecutionState: (action1Result as any)?.executionState,
      action2ExecutionState: (action2Result as any)?.executionState,
    }))
  })

  // --------------------------------------------------------------------------
  // Case H: Double Settlement Rejected - Settled Action Retains Original State
  // --------------------------------------------------------------------------
  it('case H: Settled Action Rejects Duplicate Settlement - Original settlement is immutable', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    external.execute.mockImplementation(() => {
      physicalSideEffects++
      return execution({ stdout: JSON.stringify({ activated: true }), stderr: '' })
    })

    await executeTool(
      { argv: [...action.argv] },
      { attribution: action.attribution, actionId: action.id },
    )

    const settled = host.actionManager.get(action.id)
    expect(settled?.status).toBe('consumed')
    expect(settled?.settlement).toMatchObject({
      outcome: 'success',
      executionState: 'executed',
      exitCode: 0,
    })

    // Attempting a duplicate settlement must throw and not mutate original settlement
    expect(() => {
      host.actionManager.settle(action.id, {
        outcome: 'failed',
        executionState: 'unknown',
        error: 'Duplicate forged settlement',
      })
    }).toThrow(/unsettled/)

    // Attempting cancellation must not alter the consumed/settled action
    const cancelledCount = host.actionManager.cancelInvocation(action.attribution, 'Late cancel attempt')
    expect(cancelledCount).toBe(0)

    const reChecked = host.actionManager.get(action.id)
    expect(reChecked?.status).toBe('consumed')
    expect(reChecked?.settlement).toMatchObject({
      outcome: 'success',
      executionState: 'executed',
      exitCode: 0,
    })

    console.info('CASE_H_EVIDENCE', JSON.stringify({
      case: 'Case H (Duplicate Settlement Rejection)',
      originalSettlement: settled?.settlement,
      immutableAfterDuplicateAttempt: true,
      cancelledCountOnSettledAction: cancelledCount,
    }))
  })

  // --------------------------------------------------------------------------
  // Case I: Renderer Unknown Result Handling - Preserves Unknown and Error Context
  // --------------------------------------------------------------------------
  it('case I: Renderer preserves unknown executionState alongside original error details', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    const customError = Object.assign(new Error('Target process hang detected after 60000ms'), {
      killed: true,
      code: null,
      stderr: 'Timeout waiting for UI tree synchronization',
    })

    external.execute.mockImplementation(() => {
      physicalSideEffects++
      const child = new PassThrough()
      return Object.assign(Promise.reject(customError), { child: { stdin: child } }) as CliExecution
    })

    let rendererError: Error | undefined
    try {
      await executeTool(
        { argv: [...action.argv] },
        { attribution: action.attribution, actionId: action.id },
      )
    }
    catch (err) {
      rendererError = err as Error
    }

    expect(rendererError).toBeDefined()
    // Preserves unknown execution state
    expect((rendererError as any)?.executionState).toBe('unknown')
    expect((rendererError as any)?.executionState).not.toBe('not_executed')
    expect((rendererError as any)?.executionState).not.toBe('executed')
    // Retains original error information and context
    expect(rendererError?.message).toContain('Target process hang detected after 60000ms')

    const hostSettled = host.actionManager.get(action.id)
    expect(hostSettled?.settlement).toMatchObject({
      outcome: 'failed',
      executionState: 'unknown',
      error: 'Target process hang detected after 60000ms',
    })

    console.info('CASE_I_EVIDENCE', JSON.stringify({
      case: 'Case I (Renderer Unknown Preservation)',
      rendererExecutionState: (rendererError as any)?.executionState,
      retainedErrorMessage: rendererError?.message,
      hostSettlement: hostSettled?.settlement,
    }))
  })
})
