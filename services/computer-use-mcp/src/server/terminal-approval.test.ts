import type { TerminalSnapshot, TerminalSpawnInput } from '@proj-airi/stage-shared/terminal-approval'

import type { TerminalCommandResult, TerminalRunner } from '../types'
import type { ComputerUseServerOptions } from './runtime'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { cwd, pid, platform } from 'node:process'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { terminalDiscardMethod, terminalExecuteMethod, terminalOriginMetaKey, terminalSnapshotSchema } from '@proj-airi/stage-shared/terminal-approval'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import * as v from 'valibot'

import { createDryRunExecutor } from '../executors/dry-run'
import { createComputerUseMcpServer } from '../server'
import { createDisplayInfo, createLocalExecutionTarget, createPermissionInfo, createTestConfig } from '../test-fixtures'

const nonce = 'c'.repeat(64)
const cleanups: Array<() => Promise<void>> = []
const evidence: Array<Record<string, unknown>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
  for (const record of evidence.splice(0))
    console.info(JSON.stringify({ boundary: 'Mock Terminal through real MCP protocol. No UI approval or native spawn.', ...record }))
})

async function fixture(desktopDryRun = false) {
  const root = await mkdtemp(join(tmpdir(), 'airi-terminal-approval-'))
  cleanups.push(async () => {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
      throw new Error('Fixture cleanup escaped its temporary root.')
    await rm(root, { force: true, recursive: true })
  })
  const oracle = { dispatches: 0, effects: 0 }
  function complete(input: TerminalSpawnInput): TerminalCommandResult {
    oracle.dispatches++
    oracle.effects++
    return { command: input.command, effectiveCwd: input.effectiveCwd, stdout: 'Executor claim only. Oracle is separate.', stderr: '', exitCode: 0, timedOut: false, durationMs: 1 }
  }
  const terminal: TerminalRunner = {
    describe: () => ({ kind: 'local-shell-runner', notes: ['Mock executor.'] }),
    getState: () => ({ effectiveCwd: root }),
    resetState: () => ({ effectiveCwd: root }),
    prepare: input => ({ command: input.command, shell: 'fixture-shell', argv: ['--command', input.command], effectiveCwd: input.cwd || root, requestedCwd: input.cwd, cwdSource: input.cwd ? 'argument' : 'runner-state', timeoutMs: input.timeoutMs ?? 1000, executorPid: pid, executorPlatform: platform, executorCwd: cwd(), detached: false, windowsHide: true }),
    startPrepared: vi.fn(input => ({ result: Promise.resolve(complete(input)), closed: Promise.resolve() })),
    execute: vi.fn(async () => {
      throw new Error('This test must not reach the ordinary unprepared executor.')
    }),
  }
  const config = createTestConfig({
    sessionRoot: root,
    auditLogPath: join(root, 'audit.jsonl'),
    screenshotsDir: join(root, 'screenshots'),
    executor: 'dry-run',
    approvalMode: 'actions',
    defaultCaptureAfter: false,
    requireSessionTagForMutatingActions: false,
    requireAllowedBoundsForMutatingActions: false,
    requireCoordinateAlignmentForMutatingActions: false,
    denyApps: [],
    denyWindowTitles: [],
    remoteSshHost: '192.0.2.1',
    browserDomBridge: { enabled: false, host: '127.0.0.1', port: 0, requestTimeoutMs: 1000 },
  })
  const options: ComputerUseServerOptions & { terminalControlNonce: string } = {
    terminalControlNonce: nonce,
    terminalRunnerFactory: () => terminal,
    executorFactory: (config) => {
      const executor = createDryRunExecutor(config)
      return {
        ...executor,
        getForegroundContext: desktopDryRun ? executor.getForegroundContext : async () => ({ available: true, appName: 'Fixture', windowTitle: 'Fixture', platform }),
        getExecutionTarget: desktopDryRun ? executor.getExecutionTarget : async () => createLocalExecutionTarget({ hostName: 'fixture-host' }),
        getDisplayInfo: async () => createDisplayInfo(),
        getPermissionInfo: async () => createPermissionInfo(),
      }
    },
  }
  const { server, runtime } = await createComputerUseMcpServer(config, options)
  vi.spyOn(runtime.cdpBridgeManager, 'probeAvailability').mockResolvedValue({ endpoint: 'http://example.com', connected: false, connectable: false, lastError: 'Browser probing is disabled in this controlled fixture.' })
  const client = new Client({ name: 'mock-main', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  cleanups.push(async () => {
    evidence.push({ oracle: { ...oracle }, ordinaryExecutorCalls: vi.mocked(terminal.execute).mock.calls.length })
    await client.close()
    await server.close()
    await runtime.browserDomBridge.close()
    await runtime.cdpBridgeManager.close()
  })
  async function prepare() {
    const result = CallToolResultSchema.parse(await client.callTool({
      name: 'terminal_exec',
      arguments: { command: 'fixture-command', cwd: root },
      _meta: { [terminalOriginMetaKey]: { nonce, requestId: 'req-fixture', toolCallId: 'call-fixture' } },
    }))
    evidence.push({ modelToolResult: structuredClone(result), oracle: { ...oracle } })
    expect(result.structuredContent).toMatchObject({ status: 'approval_required' })
    expect(oracle.dispatches).toBe(0)
    expect(oracle.effects).toBe(0)
    return v.parse(terminalSnapshotSchema, result.structuredContent?.preparedTerminal)
  }
  function commit(snapshot: TerminalSnapshot, overrides: Record<string, unknown> = {}, signal?: AbortSignal) {
    return client.request({ method: terminalExecuteMethod, params: { nonce, snapshot, expiresAt: Date.now() + 10_000, ...overrides } }, CallToolResultSchema, { signal })
  }
  return { client, terminal, oracle, prepare, commit, runtime, serverTransport }
}

function barrier() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

describe('main-only Terminal execution protocol', () => {
  it('passes transport cancellation to an already dispatched executor without claiming zero dispatch', async () => {
    const h = await fixture()
    const started = barrier()
    const closed = barrier()
    const stopped = barrier()
    let stopRequests = 0
    vi.mocked(h.terminal.startPrepared!).mockImplementationOnce((input, signal) => {
      h.oracle.dispatches++
      h.oracle.effects++
      signal?.addEventListener('abort', () => {
        stopRequests++
        stopped.release()
      }, { once: true })
      started.release()
      return { result: closed.promise.then(() => ({ command: input.command, effectiveCwd: input.effectiveCwd, stdout: 'Side effect recorded independently.', stderr: '', exitCode: 1, timedOut: false, durationMs: 1 })), closed: closed.promise }
    })
    const prepared = await h.prepare()
    const result = h.commit(prepared).catch(error => error)
    await started.promise
    await h.client.close()
    const error = await result
    // Protocol close aborts synchronously. The independent close gate still owns the executor.
    evidence.push({ oracle: { ...h.oracle }, stopRequests, providerResult: String(error), directShellClosed: false })
    closed.release()
    expect(h.oracle).toEqual({ dispatches: 1, effects: 1 })
    expect(stopRequests).toBe(1)
    await stopped.promise
  })

  it.each([{ exitCode: 0, timedOut: false }, { exitCode: 1, timedOut: false }, { exitCode: 124, timedOut: true }])('separates desktop dry-run from the Terminal result %j', async (backend) => {
    const h = await fixture(true)
    const start = vi.mocked(h.terminal.startPrepared!)
    const original = start.getMockImplementation()!
    start.mockImplementationOnce((input) => {
      const execution = original(input)
      return { ...execution, result: execution.result.then(result => ({ ...result, ...backend })) }
    })
    const prepared = await h.prepare()
    const result = await h.commit(prepared)
    evidence.push({ privateHostResult: result, oracle: { ...h.oracle } })

    expect(h.oracle).toEqual({ dispatches: 1, effects: 1 })
    expect(result.structuredContent).toMatchObject({ terminalBackend: 'local-shell-runner', executionTarget: { mode: 'dry-run' }, context: { available: false }, backendResult: { ...backend, effectiveCwd: prepared.effectiveCwd }, executorInvoked: true, terminalLifecycle: 'closed' })
    expect(JSON.stringify(result.content)).toContain('executionTarget and context describe the desktop backend')
    expect(JSON.stringify(result.content)).toContain('backendResult.effectiveCwd is the directory used to spawn this command')
  })

  it('scopes a Terminal exception without claiming that it failed on a dry-run Shell', async () => {
    const h = await fixture(true)
    vi.mocked(h.terminal.startPrepared!).mockImplementationOnce(() => {
      h.oracle.dispatches++
      h.oracle.effects++
      return { result: Promise.reject(new Error('Controlled Terminal response failure.')), closed: Promise.resolve() }
    })
    const prepared = await h.prepare()
    const result = await h.commit(prepared)
    evidence.push({ privateHostResult: result, oracle: { ...h.oracle } })

    expect(h.oracle).toEqual({ dispatches: 1, effects: 1 })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({ terminalBackend: 'local-shell-runner', executionTarget: { mode: 'dry-run' }, executorInvoked: true, terminalLifecycle: 'closed' })
    expect(JSON.stringify(result.content)).not.toContain('failed on local dry-run')
    expect(JSON.stringify(result.content)).toContain('executionTarget and context describe the desktop backend')
  })

  it('prepares without effects and dispatches the exact snapshot once from the private Host request', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    const result = await h.commit(prepared)
    evidence.push({ privateHostResult: result, oracle: { ...h.oracle } })
    expect(h.oracle.dispatches).toBe(1)
    expect(h.oracle.effects).toBe(1)
    expect(result.structuredContent).toMatchObject({ terminalLifecycle: 'closed', executorInvoked: true })
    expect(h.terminal.execute).not.toHaveBeenCalled()
  })

  it('keeps public self-approval and guessed private tool names closed', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    const approval = await h.client.callTool({ name: 'desktop_approve_pending_action', arguments: { id: prepared.preparedId, approved: true } })
    const guessed = await h.client.callTool({ name: terminalExecuteMethod, arguments: { nonce, snapshot: prepared } })
    evidence.push({ approvalToolResult: approval, guessedToolResult: guessed })
    expect(approval.isError).toBe(true)
    expect(guessed.isError).toBe(true)
    expect(h.oracle.dispatches).toBe(0)
    expect(h.oracle.effects).toBe(0)
  })

  it('rejects a foreign control credential before executor dispatch', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    await expect(h.commit(prepared, { nonce: 'x'.repeat(64) })).rejects.toThrow()
    expect(h.oracle.dispatches).toBe(0)
    expect(h.oracle.effects).toBe(0)
  })

  it.each(['command', 'effectiveCwd', 'shell'] as const)('rejects replacement %s in the approved snapshot', async (field) => {
    const h = await fixture()
    const prepared = await h.prepare()
    await expect(h.commit({ ...prepared, [field]: 'replacement' })).rejects.toThrow()
    expect(h.oracle.dispatches).toBe(0)
    expect(h.oracle.effects).toBe(0)
  })

  it('rejects expired commits without invoking an executor', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    await expect(h.commit(prepared, { expiresAt: Date.now() - 1 })).rejects.toThrow()
    expect(h.oracle.dispatches).toBe(0)
    expect(h.oracle.effects).toBe(0)
  })

  it('does not recreate execution permission after a consumed prepared operation', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    await h.commit(prepared)
    await expect(h.commit(prepared)).rejects.toThrow()
    expect(h.oracle.dispatches).toBe(1)
    expect(h.oracle.effects).toBe(1)
  })

  it('does not acknowledge a discarded operation when the request owner differs', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    const reply = await h.client.request({ method: terminalDiscardMethod, params: { nonce, preparedId: prepared.preparedId, requestId: 'another-request' } }, z.object({ discarded: z.boolean() }))
    await h.commit(prepared)
    evidence.push({ discardReply: reply, oracleAfterCorrectCommit: { ...h.oracle } })
    expect(reply.discarded).toBe(false)
    expect(h.oracle.dispatches).toBe(1)
    expect(h.oracle.effects).toBe(1)
  })

  it('does not call an in-flight original execution closed when a duplicate request is refused', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    let started!: () => void
    let release!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    if (!h.terminal.startPrepared)
      throw new Error('Missing prepared execution in the mock fixture.')
    vi.mocked(h.terminal.startPrepared).mockImplementation((input) => {
      h.oracle.dispatches++
      h.oracle.effects++
      started()
      return {
        result: barrier.then(() => ({ command: input.command, effectiveCwd: input.effectiveCwd, exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 0 })),
        closed: barrier,
      }
    })
    const original = h.commit(prepared)
    await ready
    let refusal: unknown
    try {
      await h.commit(prepared)
    }
    catch (error) {
      refusal = error
    }
    finally {
      release()
    }
    await original
    if (!(refusal instanceof McpError))
      throw new Error('The duplicate request did not return a protocol refusal.')
    const data = v.parse(v.object({ noNewDispatch: v.optional(v.boolean()), terminalLifecycle: v.optional(v.string()) }), refusal.data)
    evidence.push({ duplicateRefusal: refusal.data, originalOracle: { ...h.oracle } })
    expect(data.terminalLifecycle).not.toBe('closed')
    expect(data.noNewDispatch).toBe(true)
    expect(h.oracle.dispatches).toBe(1)
    expect(h.oracle.effects).toBe(1)
  })

  it.each(['notification', 'transport-close'] as const)('performs zero executor dispatches when %s cancels control while readiness is blocked', async (mode) => {
    const h = await fixture()
    const prepared = await h.prepare()
    const ready = barrier()
    const release = barrier()
    const cancelled = barrier()
    const retired = barrier()
    const originalRemove = h.runtime.session.removePendingAction.bind(h.runtime.session)
    vi.spyOn(h.runtime.session, 'removePendingAction').mockImplementation((id) => {
      const result = originalRemove(id)
      retired.release()
      return result
    })
    vi.spyOn(h.runtime.executor, 'getForegroundContext').mockImplementationOnce(async () => {
      ready.release()
      await release.promise
      return { available: true, appName: 'Fixture', windowTitle: 'Fixture', platform }
    })
    const receive = h.serverTransport.onmessage
    h.serverTransport.onmessage = (message, extra) => {
      receive?.(message, extra)
      if ('method' in message && message.method === 'notifications/cancelled')
        cancelled.release()
    }
    const abort = new AbortController()
    const result = h.commit(prepared, {}, abort.signal)
    const rejected = expect(result).rejects.toThrow()
    await ready.promise
    if (mode === 'notification') {
      abort.abort(new Error('Host stopped before the executor boundary.'))
      await cancelled.promise
    }
    else {
      await h.client.close()
    }
    release.release()
    await rejected
    await retired.promise
    evidence.push({ case: 'control-cancel-during-readiness', mode, oracle: { ...h.oracle }, pendingAfter: h.runtime.session.getPendingAction(prepared.preparedId) })
    expect(h.oracle.dispatches).toBe(0)
    expect(h.oracle.effects).toBe(0)
  })

  it('rechecks expiry at the executor boundary after asynchronous readiness', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    const ready = barrier()
    const release = barrier()
    vi.spyOn(h.runtime.executor, 'getForegroundContext').mockImplementationOnce(async () => {
      ready.release()
      await release.promise
      return { available: true, appName: 'Fixture', windowTitle: 'Fixture', platform }
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      const pending = h.commit(prepared, { expiresAt: 2000 })
      await ready.promise
      now.mockReturnValue(2000)
      release.release()
      const result = await pending
      evidence.push({ case: 'expiry-after-readiness', privateHostResult: result, oracle: { ...h.oracle } })
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toMatchObject({ executorInvoked: false, noNewDispatch: true, terminalLifecycle: 'closed' })
      expect(h.oracle).toEqual({ dispatches: 0, effects: 0 })
    }
    finally {
      now.mockRestore()
    }
  })

  it('keeps a timeout result pending until the direct executor lifecycle actually closes', async () => {
    const h = await fixture()
    const prepared = await h.prepare()
    const started = barrier()
    const closed = barrier()
    const updateResult = vi.spyOn(h.runtime.stateManager, 'updateTerminalResult')
    if (!h.terminal.startPrepared)
      throw new Error('Missing prepared executor.')
    vi.mocked(h.terminal.startPrepared).mockImplementation((input) => {
      h.oracle.dispatches++
      h.oracle.effects++
      started.release()
      return { result: Promise.resolve({ command: input.command, effectiveCwd: input.effectiveCwd, exitCode: 124, timedOut: true, stdout: 'Controlled effect occurred.', stderr: 'timeout', durationMs: 1000 }), closed: closed.promise }
    })
    let replied = false
    const result = h.commit(prepared).then((value) => {
      replied = true
      return value
    })
    await started.promise
    await new Promise<void>(resolve => setImmediate(resolve))
    const beforeClose = { replied, resultUpdates: updateResult.mock.calls.length, oracle: { ...h.oracle } }
    closed.release()
    const reply = await result
    expect(beforeClose.replied).toBe(false)
    expect(beforeClose.resultUpdates).toBe(0)
    expect(beforeClose.oracle).toEqual({ dispatches: 1, effects: 1 })
    expect(updateResult).toHaveBeenCalledOnce()
    evidence.push({ case: 'timeout-before-close', privateHostResult: reply, oracle: { ...h.oracle } })
    expect(reply.structuredContent).toMatchObject({ terminalLifecycle: 'closed', backendResult: { exitCode: 124, timedOut: true } })
  })
})
