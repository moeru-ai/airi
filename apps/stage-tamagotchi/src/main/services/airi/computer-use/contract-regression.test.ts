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
import { ComputerUseExecutionError, computerUseRun } from '../../../../shared/eventa/computer-use'
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
    expect(rendererError?.message).toContain('[executionState: unknown]')
    expect(rendererError?.message).not.toContain('not_executed')

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

    await vi.waitFor(() => {
      const rec = host.actionManager.get(action.id)
      expect(rec?.settlement).toBeDefined()
    })

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
    expect(rendererError?.message).toContain('[executionState: unknown]')
    expect(rendererError?.message).not.toContain('not_executed')

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
        const child = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(),
          exitCode: null as number | null,
          signalCode: null as NodeJS.Signals | null,
          killed: false,
          pid: 99999,
          kill: vi.fn(),
        })
        return Object.assign(
          new Promise<CliResult>((_, reject) => {
            options.signal?.addEventListener('abort', () => {
              // Real Node execFileAsync rejects immediately on abort with AbortError
              child.killed = true
              reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' }))

              // But the child process takes 40ms to close and emit 'close'
              setTimeout(() => {
                action1Running = false
                action1Closed = true
                child.exitCode = 0
                child.emit('close', 0, null)
              }, 40)
            })
          }),
          { child },
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
      argv: ['invoke', 'window.list', '--help'],
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

  // --------------------------------------------------------------------------
  // Case J: Cancellation While Queued on Host (Pre-dispatch) - Renderer Retains not_executed (ISSUE-1)
  // --------------------------------------------------------------------------
  it('case J: Host returns authoritative not_executed while renderer abortSignal is aborted - renderer retains not_executed', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    const abortController = new AbortController()

    // Host confirms cancelled before dispatch and throws not_executed, while abortSignal is simultaneously aborted
    const originalSend = renderer.window.webContents.send
    renderer.window.webContents.send = (channel: string, payload: unknown) => {
      originalSend(channel, payload)
      if (!abortController.signal.aborted) {
        abortController.abort(new Error('Turn aborted by client'))
      }
    }

    vi.spyOn(host.getRuntime(), 'run').mockImplementation(async () => {
      throw new ComputerUseExecutionError('Host confirmed: queued work cancelled before dispatch', {
        executionState: 'not_executed',
        argv: action.argv,
      })
    })

    let rendererError: Error | undefined
    try {
      await executeTool(
        { argv: [...action.argv] },
        { attribution: action.attribution, actionId: action.id, abortSignal: abortController.signal },
      )
    }
    catch (err) {
      rendererError = err as Error
    }

    expect(rendererError).toBeDefined()
    expect(abortController.signal.aborted).toBe(true)
    expect((rendererError as any)?.executionState).toBe('not_executed')
    expect(rendererError?.message).toContain('not_executed')
    expect(rendererError?.message).toContain('Host confirmed: queued work cancelled before dispatch')

    console.info('CASE_J_EVIDENCE', JSON.stringify({
      case: 'Case J (Authoritative not_executed Retained Under AbortSignal)',
      rendererExecutionState: (rendererError as any)?.executionState,
      message: rendererError?.message,
    }))
  })

  // --------------------------------------------------------------------------
  // Case K: Missing Host Authoritative State - Renderer Conservatively Infers unknown
  // --------------------------------------------------------------------------
  it('case K: Missing host authoritative state conservatively infers unknown without downgrading', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])

    // Simulate an unexpected error across IPC that carries NO authoritative executionState
    external.execute.mockImplementation(() => {
      throw new Error('Transport pipe unexpectedly disconnected')
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
    // When Host cannot provide authoritative state after dispatch, conservative state must be unknown
    expect((rendererError as any)?.executionState).toBe('unknown')

    console.info('CASE_K_EVIDENCE', JSON.stringify({
      case: 'Case K (Missing Authoritative State Infers Unknown)',
      rendererExecutionState: (rendererError as any)?.executionState,
      message: rendererError?.message,
    }))
  })

  // --------------------------------------------------------------------------
  // Case L: Redundant Error Wrapping Elimination (ISSUE-5)
  // --------------------------------------------------------------------------
  it('case L: Nonzero exit throws ComputerUseExecutionError without duplicate nested wrapping', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'NonExistentApp'])
    external.execute.mockImplementation(() => {
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

    expect(rendererError).toBeDefined()
    expect((rendererError as any)?.executionState).toBe('executed')
    // Must NOT wrap another ComputerUseExecutionError as its cause
    expect(rendererError?.cause).not.toBeInstanceOf(ComputerUseExecutionError)

    console.info('CASE_L_EVIDENCE', JSON.stringify({
      case: 'Case L (No Redundant Re-wrapping)',
      name: rendererError?.name,
      causeType: rendererError?.cause ? typeof rendererError.cause : 'none',
      isDuplicateWrapped: rendererError?.cause instanceof ComputerUseExecutionError,
    }))
  })

  // --------------------------------------------------------------------------
  // Case M: Long-lived AbortSignal listener cleanup (ISSUE-3)
  // --------------------------------------------------------------------------
  it('case M: AbortSignal listener is cleaned up after process completion', async () => {
    vi.useFakeTimers()
    try {
      const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
      const longLivedController = new AbortController()

      let capturedSignal: AbortSignal | undefined
      const killSpy = vi.fn()
      external.execute.mockImplementation((_file, _args, options) => {
        capturedSignal = options.signal
        const execResult = execution({ stdout: JSON.stringify({ activated: true }), stderr: '' })
        ;(execResult.child as any).kill = killSpy
        return execResult
      })

      await executeTool(
        { argv: [...action.argv] },
        { attribution: action.attribution, actionId: action.id, abortSignal: longLivedController.signal },
      )

      expect(external.execute).toHaveBeenCalledTimes(1)
      expect(capturedSignal).toBeDefined()

      // Aborting after completion must NOT schedule force-kill or invoke kill on the completed child
      longLivedController.abort(new Error('Post-execution abort'))
      vi.advanceTimersByTime(5000)

      expect(killSpy).not.toHaveBeenCalled()

      console.info('CASE_M_EVIDENCE', JSON.stringify({
        case: 'Case M (Abort Listener Cleanup)',
        signalCleaned: true,
        deadChildKillCalled: false,
      }))
    }
    finally {
      vi.useRealTimers()
    }
  })

  // --------------------------------------------------------------------------
  // Case N: Pre-dispatch Failure Does Not Falsely Report unknown (ISSUE-4 / Req 4)
  // --------------------------------------------------------------------------
  it('case N: Pre-dispatch validation failures reliably report not_executed and never unknown', async () => {
    // Sub-case 1: Mutating action invoked before approval (pending state)
    const pendingAction = host.actionManager.createPendingAction({
      argv: ['invoke', 'app.activate', 'Calculator'],
      attribution: origin(),
    })
    expect(pendingAction.status).toBe('pending')

    let unapprovedError: Error | undefined
    try {
      await executeTool(
        { argv: [...pendingAction.argv] },
        { attribution: pendingAction.attribution, actionId: pendingAction.id },
      )
    }
    catch (err) {
      unapprovedError = err as Error
    }

    expect(unapprovedError).toBeDefined()
    expect((unapprovedError as any)?.executionState).toBe('not_executed')
    expect(unapprovedError?.message).toContain('[executionState: not_executed]')
    expect(unapprovedError?.message).toContain('has not been approved')
    expect(external.execute).toHaveBeenCalledTimes(0)

    // Sub-case 2: Invalid input schema (< 2 argv items)
    let schemaError: Error | undefined
    try {
      await executeTool(
        { argv: ['invoke'] },
        { attribution: origin() },
      )
    }
    catch (err) {
      schemaError = err as Error
    }

    expect(schemaError).toBeDefined()
    expect((schemaError as any)?.executionState).toBe('not_executed')
    expect(schemaError?.message).toContain('[executionState: not_executed]')
    expect(external.execute).toHaveBeenCalledTimes(0)

    console.info('CASE_N_EVIDENCE', JSON.stringify({
      case: 'Case N (Pre-dispatch Failures Reliably not_executed)',
      unapprovedActionExecutionState: (unapprovedError as any)?.executionState,
      schemaValidationExecutionState: (schemaError as any)?.executionState,
      executorCalls: 0,
    }))
  })

  // --------------------------------------------------------------------------
  // Scenario A: First executor leaves lingering risk -> already-queued mutating operation blocked
  // --------------------------------------------------------------------------
  it('scenario A: Already-queued mutating operation is blocked before dispatch when prior operation leaves lingering risk', async () => {
    const action1 = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    const action2 = createApprovedAction(['invoke', 'app.activate', 'Terminal'], origin('turn-2'))

    let action1Entered: () => void
    const action1EnteredPromise = new Promise<void>(r => (action1Entered = r))
    let action1Child: any

    external.execute.mockImplementationOnce(() => {
      action1Entered()
      action1Child = new EventEmitter()
      action1Child.exitCode = null
      action1Child.signalCode = null
      action1Child.stdin = new PassThrough()

      const p = new Promise<CliResult>((resolve) => {
        setTimeout(() => {
          // Direct child exits, but stdio never closes (simulating lingering background worker)
          action1Child.emit('exit', 0, null)
          resolve({ stdout: JSON.stringify({ activated: true, mode: 'lingering' }), stderr: '' })
        }, 50)
      })

      return Object.assign(p, { child: action1Child }) as CliExecution
    })

    const action1Promise = executeTool(
      { argv: [...action1.argv] },
      { attribution: action1.attribution, actionId: action1.id },
    ).catch(err => err as Error)

    await action1EnteredPromise

    // Enqueue action 2 while action 1 is still in-flight
    const action2Promise = executeTool(
      { argv: [...action2.argv] },
      { attribution: action2.attribution, actionId: action2.id },
    ).catch(err => err as Error)

    const [action1Res, action2Res] = await Promise.all([action1Promise, action2Promise])

    // Action 1 completed, but triggered bounded 1000ms pipe destruction -> lingering mutation risk
    expect(action1Res).not.toBeInstanceOf(Error)

    // Action 2 was already queued, but must be blocked before dispatch with not_executed
    expect(action2Res).toBeInstanceOf(Error)
    expect((action2Res as any).executionState).toBe('not_executed')
    expect((action2Res as any).message).toContain('unconfirmed background processes')
    expect(external.execute).toHaveBeenCalledTimes(1)

    console.info('SCENARIO_A_EVIDENCE', JSON.stringify({
      case: 'Scenario A (Already-queued Mutating Blocked by Prior Lingering Risk)',
      action1Succeeded: typeof action1Res === 'string',
      action2ExecutionState: (action2Res as any).executionState,
      executorCalls: 1,
    }))
  }, 10000)

  // --------------------------------------------------------------------------
  // Scenario B: Risk flag set -> new mutating operation blocked, command help continues
  // --------------------------------------------------------------------------
  it('scenario B: When risk flag is set, new mutating operations are blocked while command help remains available', async () => {
    const action1 = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    const abortController = new AbortController()

    let action1Entered: () => void
    const action1EnteredPromise = new Promise<void>(r => (action1Entered = r))

    external.execute.mockImplementationOnce((_file, _args, options) => {
      action1Entered()
      const child = new EventEmitter() as any
      child.exitCode = null
      child.signalCode = null
      child.stdin = new PassThrough()
      const p = new Promise<CliResult>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { killed: true }))
        })
      })
      return Object.assign(p, { child }) as CliExecution
    })

    const action1Promise = executeTool(
      { argv: [...action1.argv] },
      { attribution: action1.attribution, actionId: action1.id, abortSignal: abortController.signal },
    ).catch(err => err as Error)

    await action1EnteredPromise
    abortController.abort(new Error('User abort'))
    await action1Promise

    // Risk flag is active. Initiate a NEW mutating action
    const mutatingAction = createApprovedAction(['invoke', 'app.activate', 'Notepad'], origin('turn-new'))
    let mutatingError: Error | undefined
    try {
      await executeTool(
        { argv: [...mutatingAction.argv] },
        { attribution: mutatingAction.attribution, actionId: mutatingAction.id },
      )
    }
    catch (err) {
      mutatingError = err as Error
    }

    expect(mutatingError).toBeDefined()
    expect((mutatingError as any).executionState).toBe('not_executed')
    expect(mutatingError?.message).toContain('unconfirmed background processes')

    // Request command help without observing the desktop
    external.execute.mockImplementationOnce(() => {
      return execution({ stdout: 'AUV command usage', stderr: '' })
    })

    const helpResult = await executeTool(
      { argv: ['invoke', 'window.list', '--help'] },
      { attribution: origin('turn-read') },
    )

    expect(helpResult).toBeDefined()
    expect(JSON.parse(helpResult as string).output).toBe('AUV command usage')

    console.info('SCENARIO_B_EVIDENCE', JSON.stringify({
      case: 'Scenario B (Risk Gating: Mutating Blocked, Help Allowed)',
      mutatingExecutionState: (mutatingError as any).executionState,
      helpSucceeded: true,
    }))
  })

  // --------------------------------------------------------------------------
  // Scenario C: Post-dispatch unexpected JS exception -> executionState MUST NOT be not_executed
  // --------------------------------------------------------------------------
  it('scenario C: Ordinary JS exception post-dispatch results in unknown and never not_executed', async () => {
    const action = createApprovedAction(['invoke', 'app.activate', 'Calculator'])

    external.execute.mockImplementationOnce(() => {
      throw new TypeError('Unexpected JS exception in executor pipeline')
    })

    let postDispatchError: Error | undefined
    try {
      await executeTool(
        { argv: [...action.argv] },
        { attribution: action.attribution, actionId: action.id },
      )
    }
    catch (err) {
      postDispatchError = err as Error
    }

    expect(postDispatchError).toBeDefined()
    expect((postDispatchError as any).executionState).not.toBe('not_executed')
    expect((postDispatchError as any).executionState).toBe('unknown')
    expect(postDispatchError?.message).toContain('[executionState: unknown]')
    expect(postDispatchError?.message).toContain('Unexpected JS exception in executor pipeline')

    console.info('SCENARIO_C_EVIDENCE', JSON.stringify({
      case: 'Scenario C (Post-dispatch Exception Never not_executed)',
      executionState: (postDispatchError as any).executionState,
      message: postDispatchError?.message,
    }))
  })

  // --------------------------------------------------------------------------
  // Scenario D: Normal child exit with delayed stdio drain does not permanently lock mutating operations
  // --------------------------------------------------------------------------
  it('scenario D: Normal child exit with delayed stdio drain does not lock mutating operations', async () => {
    const action1 = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    const action2 = createApprovedAction(['invoke', 'app.activate', 'Terminal'], origin('turn-2'))

    external.execute.mockImplementationOnce(() => {
      const child = new EventEmitter() as any
      child.exitCode = null
      child.signalCode = null
      child.stdin = new PassThrough()
      const p = new Promise<CliResult>((resolve) => {
        setTimeout(() => {
          child.emit('exit', 0, null)
          setTimeout(() => {
            child.emit('close', 0, null)
            resolve({ stdout: JSON.stringify({ activated: true }), stderr: '' })
          }, 60)
        }, 20)
      })
      return Object.assign(p, { child }) as CliExecution
    })

    external.execute.mockImplementationOnce(() => {
      return execution({ stdout: JSON.stringify({ activated: true }), stderr: '' })
    })

    const action1Result = await executeTool(
      { argv: [...action1.argv] },
      { attribution: action1.attribution, actionId: action1.id },
    )
    expect(action1Result).toBeDefined()

    const action2Result = await executeTool(
      { argv: [...action2.argv] },
      { attribution: action2.attribution, actionId: action2.id },
    )
    expect(action2Result).toBeDefined()
    expect(external.execute).toHaveBeenCalledTimes(2)

    console.info('SCENARIO_D_EVIDENCE', JSON.stringify({
      case: 'Scenario D (Delayed Stdio Normal Drain Does Not Lock Mutation)',
      action1Succeeded: true,
      action2Succeeded: true,
      executorCalls: 2,
    }))
  })

  // --------------------------------------------------------------------------
  // Scenario E: Daemon restart or reconnect does NOT clear lingering mutation risk
  // --------------------------------------------------------------------------
  it('scenario E: Reconnecting or restarting daemon does not clear lingering mutation risk and preserves mutation blocking', async () => {
    let daemon1Exited: () => void
    const daemon1ExitedPromise = new Promise<void>(r => (daemon1Exited = r))

    // First daemon instance
    external.start.mockResolvedValueOnce({
      connectionOptions: { credential: 'test-token-1' },
      endpoints: ['ipc://test-auv-1'],
      exited: daemon1ExitedPromise,
      stop: vi.fn(),
    })

    const action1 = createApprovedAction(['invoke', 'app.activate', 'Calculator'])
    const abortController = new AbortController()

    let action1Entered: () => void
    const action1EnteredPromise = new Promise<void>(r => (action1Entered = r))

    external.execute.mockImplementationOnce((_file, _args, options) => {
      action1Entered()
      const child = new EventEmitter() as any
      child.exitCode = null
      child.signalCode = null
      child.stdin = new PassThrough()
      const p = new Promise<CliResult>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { killed: true }))
        })
      })
      return Object.assign(p, { child }) as CliExecution
    })

    const action1Promise = executeTool(
      { argv: [...action1.argv] },
      { attribution: action1.attribution, actionId: action1.id, abortSignal: abortController.signal },
    ).catch(err => err as Error)

    await action1EnteredPromise
    abortController.abort(new Error('User abort'))
    await action1Promise

    // Lingering mutation risk is now active.
    // Simulate daemon exit
    daemon1Exited!()
    await new Promise(r => setTimeout(r, 10))

    // Set up mock for the restarted daemon instance
    external.start.mockResolvedValueOnce({
      connectionOptions: { credential: 'test-token-2' },
      endpoints: ['ipc://test-auv-2'],
      exited: new Promise(() => {}),
      stop: vi.fn(),
    })

    // Request command help on the restarted daemon (triggers connect())
    external.execute.mockImplementationOnce(() => {
      return execution({ stdout: 'AUV command usage', stderr: '' })
    })

    const helpResult = await executeTool(
      { argv: ['invoke', 'window.list', '--help'] },
      { attribution: origin('turn-read-reconnected') },
    )

    expect(helpResult).toBeDefined()
    expect(JSON.parse(helpResult as string).output).toBe('AUV command usage')
    expect(external.start).toHaveBeenCalledTimes(2)

    // Attempt a new mutating operation: must remain blocked because risk flag was not cleared by connect()
    const mutatingAction = createApprovedAction(['invoke', 'app.activate', 'Notepad'], origin('turn-new-mutating'))
    let mutatingError: Error | undefined
    try {
      await executeTool(
        { argv: [...mutatingAction.argv] },
        { attribution: mutatingAction.attribution, actionId: mutatingAction.id },
      )
    }
    catch (err) {
      mutatingError = err as Error
    }

    expect(mutatingError).toBeDefined()
    expect((mutatingError as any).executionState).toBe('not_executed')
    expect(mutatingError?.message).toContain('unconfirmed background processes')
    expect(mutatingError?.message).toContain('Restart application before dispatching new mutations.')

    // Mutating command was rejected before dispatch and never sent to external.execute
    expect(external.execute).toHaveBeenCalledTimes(2)

    console.info('SCENARIO_E_EVIDENCE', JSON.stringify({
      case: 'Scenario E (Daemon Restart Does Not Clear Lingering Mutation Risk)',
      daemonStarts: external.start.mock.calls.length,
      helpAfterRestartSucceeded: true,
      mutatingExecutionState: (mutatingError as any).executionState,
      mutatingBlockedMessage: mutatingError?.message,
      mutatingDispatched: false,
    }))
  })
})
