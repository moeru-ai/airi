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

async function fixture() {
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
    executorFactory: config => ({
      ...createDryRunExecutor(config),
      getForegroundContext: async () => ({ available: true, appName: 'Fixture', windowTitle: 'Fixture', platform }),
      getExecutionTarget: async () => createLocalExecutionTarget({ hostName: 'fixture-host' }),
      getDisplayInfo: async () => createDisplayInfo(),
      getPermissionInfo: async () => createPermissionInfo(),
    }),
  }
  const { server, runtime } = await createComputerUseMcpServer(config, options)
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
  function commit(snapshot: TerminalSnapshot, overrides: Record<string, unknown> = {}) {
    return client.request({ method: terminalExecuteMethod, params: { nonce, snapshot, expiresAt: Date.now() + 10_000, ...overrides } }, CallToolResultSchema)
  }
  return { client, terminal, oracle, prepare, commit }
}

describe('main-only Terminal execution protocol', () => {
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
})
