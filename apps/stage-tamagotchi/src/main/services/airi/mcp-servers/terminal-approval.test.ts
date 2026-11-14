import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { TerminalNotice, TerminalSnapshot } from '@proj-airi/stage-shared/terminal-approval'

import type { TerminalApprovalOptions } from './terminal-approval'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { terminalDiscardMethod, terminalExecuteMethod } from '@proj-airi/stage-shared/terminal-approval'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PendingActionManager } from '../computer-use/action-manager'
import { createComputerUseRuntime } from '../computer-use/runtime'
import { bindTerminalApproval } from './terminal-approval'

function barrier<T>() {
  let release!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return {
    promise,
    release: (value: T) => release(value),
  }
}

const evidence: Array<Record<string, unknown>> = []
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0))
    await cleanup()
  vi.useRealTimers()
  for (const record of evidence.splice(0))
    console.info(JSON.stringify({ boundary: 'Mock Main UI decision and controlled executor. No real approval or spawn.', ...record }))
})

function fixture(shared: { actions?: PendingActionManager, runtime?: ReturnType<typeof createComputerUseRuntime>, sessionId?: string } = {}) {
  const actions = shared.actions ?? new PendingActionManager()
  const attribution = { sessionId: shared.sessionId ?? 'session-a', turnId: 'turn-a', toolCallId: `call-${shared.sessionId ?? 'a'}`, senderWebContentsId: 71 }
  const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Run the isolated fixture.' }, attribution.senderWebContentsId)
  const snapshot: TerminalSnapshot = { protocol: 'airi-terminal-approval/1', preparedId: 'prepared-a', requestId: request.id, toolCallId: attribution.toolCallId, command: 'fixture-command', shell: 'fixture-shell', argv: ['--command', 'fixture-command'], effectiveCwd: '/fixture', cwdSource: 'runner-state', executorPid: 101, executorPlatform: 'fixture', executorCwd: '/fixture', timeoutMs: 1000, detached: false, windowsHide: true }
  const decision = barrier<boolean>()
  const ready = barrier<void>()
  const queued = barrier<void>()
  const ended = barrier<void>()
  const oracle = { dispatches: 0, effects: 0, discarded: 0 }
  const notices: TerminalNotice[] = []
  const runtime = shared.runtime ?? createComputerUseRuntime({ binaryPath: 'fixture-auv', storeRoot: '/fixture', actionManager: actions })
  if (!shared.runtime)
    cleanups.push(runtime.dispose)
  const rpc = vi.fn(async (input: { method: string }) => {
    if (input.method === terminalDiscardMethod) {
      oracle.discarded++
      return { discarded: true }
    }
    if (input.method !== terminalExecuteMethod)
      throw new Error('Unexpected private method.')
    oracle.dispatches++
    oracle.effects++
    const result: CallToolResult = { content: [{ type: 'text', text: 'Executor returned. Business Oracle is separate.' }], structuredContent: { terminalLifecycle: 'closed', backendResult: { exitCode: 0, timedOut: false } } }
    return result
  })
  const client = new Client({ name: 'mock-main', version: '1.0.0' })
  client.request = rpc as Client['request']
  const connection = { client, serverName: 'fixture', nonce: 'c'.repeat(64), pid: 101, isCurrent: () => true }
  const options: TerminalApprovalOptions = { actions, present: vi.fn(() => decision.promise), notify: vi.fn(async (notice: TerminalNotice) => {
    notices.push(structuredClone(notice))
    return { status: 'stored' as const, sessionId: notice.sessionId, messageId: `terminal:${notice.actionId}` }
  }), executeInSlot: (operation, signal) => runtime.executeInSlot(async (lifetime, retainMutationRisk) => {
    queued.release()
    await ready.promise
    try {
      return await operation(lifetime, retainMutationRisk)
    }
    finally {
      ended.release()
    }
  }, signal) }
  const bind = () => bindTerminalApproval({ options, connection, attribution, payload: { name: 'fixture::terminal_exec', arguments: { command: 'fixture-command' }, requestId: request.id, attribution }, result: { content: [{ type: 'text', text: 'Approval required.' }], structuredContent: { status: 'approval_required', preparedTerminal: snapshot } } })
  function record(actionId: string) {
    evidence.push({ oracle: { ...oracle }, action: actions.get(actionId), notices: structuredClone(notices), rpcMethods: rpc.mock.calls.map(([input]) => input.method) })
  }
  return { actions, attribution, request, snapshot, decision, ready, queued, ended, oracle, rpc, connection, options, bind, record, runtime, notices }
}

describe('main Terminal approval controller', () => {
  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // Expiring a request left its completed Action in the manager forever.
  // Main releases the Action after the request expires and Notice handling finishes.
  it.each(['before', 'after'] as const)('retires a rejected action when its Notice is acknowledged %s request expiry (PR #3496)', async (order) => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const h = fixture()
    const receipt = barrier<Awaited<ReturnType<TerminalApprovalOptions['notify']>>>()
    h.options.notify = vi.fn(() => receipt.promise)
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(false)
    await vi.waitFor(() => expect(h.options.notify).toHaveBeenCalledOnce())
    h.actions.finishRequest(h.request.id, h.attribution.senderWebContentsId)
    const stored = { status: 'stored' as const, sessionId: h.request.sessionId, messageId: `terminal:${id}` }
    if (order === 'before') {
      receipt.release(stored)
      await vi.waitFor(() => expect(h.actions.get(id)?.terminal?.noticeHandled).toBe(true))
      expect(h.actions.get(id)?.status).toBe('rejected')
    }
    vi.setSystemTime(h.request.expiresAt)
    h.actions.registerRequest({ sessionId: 'session-a', turnId: 'later', text: 'Read another fixture.' }, 71)
    if (order === 'after') {
      expect(h.actions.get(id)?.status).toBe('rejected')
      receipt.release(stored)
    }
    expect(h.oracle.dispatches).toBe(0)
    expect(h.oracle.effects).toBe(0)

    await vi.waitFor(() => expect(h.actions.get(id)).toBeUndefined())
    expect(h.oracle.discarded).toBe(1)
  })

  it.each(['result', 'error'] as const)('settles a bound closed pre-dispatch %s as not_executed without restoring approval', async (channel) => {
    const h = fixture()
    const proof = { preparedId: h.snapshot.preparedId, requestId: h.request.id, noNewDispatch: true, terminalLifecycle: 'closed' }
    h.rpc.mockImplementation(async () => {
      if (channel === 'error')
        throw new McpError(ErrorCode.InvalidParams, 'Authorization expired before native dispatch.', proof)
      return { content: [{ type: 'text', text: 'Policy denied before native dispatch.' }], isError: true, structuredContent: { ...proof, executorInvoked: false } }
    })
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    h.ready.release()
    await h.ended.promise
    h.record(id)

    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.oracle.dispatches).toBe(0)
    expect(h.oracle.effects).toBe(0)
    expect(h.actions.get(id)).toMatchObject({ status: 'consumed', settlement: { outcome: 'failed', executionState: 'not_executed' } })
    expect(h.notices).toMatchObject([{ actionId: id, status: 'failed' }])
    expect(() => h.actions.approve(id)).toThrow(/consumed/)
  })

  it.each([
    ...['missing-binding', 'wrong-binding', 'unknown-lifecycle', 'contradictory-invocation'].flatMap(fault => ['result', 'error'].map(channel => ({ fault, channel }))),
    { fault: 'matching-proof', channel: 'plain-error' },
  ])('retains the mutation block for an uncertain $channel / $fault refusal', async ({ fault, channel }) => {
    const h = fixture()
    const proof = { preparedId: fault === 'wrong-binding' ? 'another-prepared-operation' : h.snapshot.preparedId, requestId: h.request.id, noNewDispatch: true, executorInvoked: fault === 'contradictory-invocation', terminalLifecycle: fault === 'unknown-lifecycle' ? 'unknown' : 'closed' }
    h.rpc.mockImplementation(async () => {
      const data = fault === 'missing-binding' ? { noNewDispatch: true, terminalLifecycle: 'closed' } : proof
      if (channel === 'error')
        throw new McpError(ErrorCode.InvalidParams, 'Unconfirmed refusal.', data)
      if (channel === 'plain-error')
        throw Object.assign(new Error('Unconfirmed refusal.'), { data })
      return { content: [{ type: 'text', text: 'Unconfirmed refusal.' }], isError: true, structuredContent: data }
    })
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    h.ready.release()
    await vi.waitFor(() => expect(h.notices).toHaveLength(1))
    let competingDispatches = 0
    const competing = h.runtime.executeInSlot(async () => {
      competingDispatches++
    }).then(() => 'executed', () => 'stopped')
    await h.ended.promise
    h.record(id)
    evidence.push({ fault, channel, competingDispatches })

    expect(h.notices[0].status).toBe('unknown')
    expect(h.actions.get(id)?.settlement).toBeUndefined()
    expect(competingDispatches).toBe(0)
    expect(await competing).toBe('stopped')
  })

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // Main marked an incomplete result unknown but sent failed in the Notice.
  // The Notice now keeps the unknown result and the closed lifecycle receipt.
  it('reports unknown in the Notice when a closed reply lacks an exit code', async () => {
    const h = fixture()
    const originalRpc = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async (input) => {
      await originalRpc(input)
      return { content: [{ type: 'text', text: 'The direct lifecycle ended, but its result is incomplete.' }], structuredContent: { terminalLifecycle: 'closed', backendResult: { timedOut: false } } }
    })
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    h.ready.release()
    await h.ended.promise
    h.record(id)

    expect(h.oracle).toMatchObject({ dispatches: 1, effects: 1 })
    expect(h.actions.get(id)?.settlement).toMatchObject({ outcome: 'failed', executionState: 'unknown' })
    expect(h.actions.get(id)?.settlement?.exitCode).toBeUndefined()
    expect(h.notices).toMatchObject([{ status: 'unknown', result: { structuredContent: { terminalLifecycle: 'closed', backendResult: { timedOut: false } } } }])
    const next = vi.fn(async () => {})
    await h.runtime.executeInSlot(next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('returns preparation, waits outside the slot, then consumes exactly once before dispatch', async () => {
    const h = fixture()
    const modelResult = h.bind()
    const id = String(modelResult.structuredContent?.hostActionId)
    evidence.push({ preparationResult: modelResult, oracle: { ...h.oracle }, action: h.actions.get(id) })
    expect(modelResult.content?.at(-1)?.text).toContain('preparation only')
    expect(modelResult.content?.at(-1)?.text).toContain('new turn of this conversation')
    expect(modelResult.content?.at(-1)?.text).toContain('An empty MCP pending list does not prove')
    expect(h.oracle.dispatches).toBe(0)
    expect(h.notices).toEqual([])
    expect(h.actions.get(id)?.status).toBe('pending')
    h.actions.finishRequest(h.request.id, h.attribution.senderWebContentsId)
    h.decision.release(true)
    await h.queued.promise
    expect(h.actions.get(id)?.status).toBe('approved')
    expect(h.oracle.effects).toBe(0)
    h.ready.release()
    await h.ended.promise
    expect(h.oracle).toMatchObject({ dispatches: 1, effects: 1 })
    expect(h.actions.get(id)).toMatchObject({ status: 'consumed', settlement: { outcome: 'success', exitCode: 0 } })
    expect(h.notices).toMatchObject([{ status: 'executed', actionId: id, sessionId: h.attribution.sessionId, turnId: h.attribution.turnId, toolCallId: h.attribution.toolCallId, result: { structuredContent: { backendResult: { exitCode: 0, timedOut: false } } } }])
    expect(() => h.actions.consume(id, { argv: [h.snapshot.shell, ...h.snapshot.argv], attribution: h.attribution, kind: 'terminal' })).toThrow(/replay/)
    h.record(id)
  })

  it('rejects through the UI decision without an executor invocation', async () => {
    const h = fixture()
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(false)
    await vi.waitFor(() => expect(h.oracle.discarded).toBe(1))
    expect(h.actions.get(id)?.status).toBe('rejected')
    expect(h.notices).toMatchObject([{ status: 'rejected', actionId: id }])
    expect(h.oracle).toMatchObject({ dispatches: 0, effects: 0 })
    h.record(id)
  })

  it('keeps a cancelled operation closed even if the late presentation returns approval', async () => {
    const h = fixture()
    const id = String(h.bind().structuredContent?.hostActionId)
    h.actions.cancelRequest(h.request.id, h.attribution.senderWebContentsId)
    h.decision.release(true)
    await vi.waitFor(() => expect(h.oracle.discarded).toBe(1))
    expect(h.actions.get(id)?.status).toBe('cancelled')
    expect(h.notices).toMatchObject([{ status: 'cancelled', actionId: id }])
    expect(h.oracle).toMatchObject({ dispatches: 0, effects: 0 })
    h.record(id)
  })

  it('refuses an expired approval before the queued executor boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const h = fixture()
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    await h.queued.promise
    vi.setSystemTime(h.actions.get(id)!.expiresAt)
    h.ready.release()
    await h.ended.promise
    expect(h.actions.get(id)?.status).toBe('expired')
    expect(h.oracle).toMatchObject({ dispatches: 0, effects: 0 })
    h.record(id)
  })

  it.each(['expired', 'cancelled'] as const)('discards a %s approval while the earlier slot is still occupied', async (status) => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const h = fixture()
    const held = barrier<void>()
    const blocker = h.runtime.executeInSlot(() => held.promise)
    const id = String(h.bind().structuredContent?.hostActionId)
    try {
      h.decision.release(true)
      await vi.advanceTimersByTimeAsync(0)
      expect(h.actions.get(id)?.status).toBe('approved')
      if (status === 'cancelled')
        h.actions.cancelRequest(h.request.id, h.attribution.senderWebContentsId)
      await vi.advanceTimersByTimeAsync(status === 'expired' ? h.actions.get(id)!.expiresAt - Date.now() : 0)

      expect(h.notices).toMatchObject([{ actionId: id, status }])
      expect(h.oracle).toEqual({ dispatches: 0, effects: 0, discarded: 1 })
    }
    finally {
      held.release()
      h.ready.release()
      await blocker
    }
  })

  it.each(['executorPid', 'requestId', 'toolCallId', 'command'] as const)('refuses replaced %s before opening a decision', (field) => {
    const h = fixture()
    const original = { ...h.snapshot }
    Object.assign(h.snapshot, { [field]: field === 'executorPid' ? 102 : 'replacement' })
    expect(() => h.bind()).toThrow()
    expect(h.options.present).not.toHaveBeenCalled()
    expect(h.oracle).toMatchObject({ dispatches: 0, effects: 0 })
    evidence.push({ rejectedField: field, original, oracle: h.oracle })
  })

  it.each(['request', 'renderer', 'host'] as const)('starts no executor when %s invalidates an approved operation still waiting for its slot', async (kind) => {
    const h = fixture()
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    await h.queued.promise
    if (kind === 'request')
      h.actions.cancelRequest(h.request.id, h.attribution.senderWebContentsId)
    else if (kind === 'renderer')
      h.actions.cancelBySender(h.attribution.senderWebContentsId)
    const stopped = kind === 'host' ? h.runtime.dispose() : undefined
    h.ready.release()
    await h.ended.promise
    await stopped
    expect(h.oracle).toMatchObject({ dispatches: 0, effects: 0 })
    expect(h.actions.get(id)?.status).toBe('cancelled')
    h.record(id)
  })

  it('retains the actual settlement after user cancellation or Renderer destruction follows dispatch', async () => {
    const h = fixture()
    const started = barrier<void>()
    const reply = barrier<void>()
    const originalRpc = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async (input) => {
      const result = await originalRpc(input)
      started.release()
      await reply.promise
      return result
    })
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    h.ready.release()
    await started.promise
    h.actions.cancelRequest(h.request.id, h.attribution.senderWebContentsId)
    h.actions.cancelBySender(h.attribution.senderWebContentsId)
    expect(h.actions.get(id)?.status).toBe('consumed')
    expect(h.actions.get(id)?.settlement).toBeUndefined()
    reply.release()
    await h.ended.promise
    expect(h.actions.get(id)?.settlement).toMatchObject({ outcome: 'success', exitCode: 0 })
    expect(h.oracle).toMatchObject({ dispatches: 1, effects: 1 })
    h.record(id)
  })

  it.each([{ exitCode: 1, timedOut: false }, { exitCode: 124, timedOut: true }])('keeps dispatched failure facts %j without restoring approval', async (backend) => {
    const h = fixture()
    const originalRpc = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async (input) => {
      const result = await originalRpc(input)
      if (!('structuredContent' in result) || !result.structuredContent)
        return result
      return { ...result, content: [{ type: 'text', text: 'Controlled failure after a possible effect.' }], structuredContent: { terminalLifecycle: 'closed', backendResult: backend } }
    })
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    h.ready.release()
    await h.ended.promise
    expect(h.oracle).toMatchObject({ dispatches: 1, effects: 1 })
    expect(h.actions.get(id)).toMatchObject({ status: 'consumed', settlement: { outcome: 'failed', exitCode: backend.exitCode } })
    expect(h.notices).toMatchObject([{ status: 'failed', result: { structuredContent: { backendResult: backend } } }])
    expect(() => h.actions.approve(id)).toThrow(/consumed/)
    h.record(id)
  })

  it('ends the slot but blocks future mutations when a response is lost after a controlled effect', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const h = fixture()
    const started = barrier<void>()
    h.rpc.mockImplementation(async () => {
      h.oracle.dispatches++
      h.oracle.effects++
      started.release()
      throw new Error('Response lost after the controlled business effect.')
    })
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    h.ready.release()
    await started.promise
    let competingDispatches = 0
    await new Promise<void>(resolve => setImmediate(resolve))
    const competing = h.runtime.executeInSlot(async () => {
      competingDispatches++
    }).then(() => 'completed', () => 'stopped')
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(h.notices).toMatchObject([{ status: 'unknown', error: 'Response lost after the controlled business effect.' }])
    expect(competingDispatches).toBe(0)
    expect(h.actions.get(id)).toMatchObject({ status: 'consumed' })
    expect(h.actions.get(id)?.settlement).toBeUndefined()
    vi.setSystemTime(h.request.expiresAt)
    h.actions.registerRequest({ sessionId: 'session-a', turnId: 'later', text: 'Read another fixture.' }, 71)
    expect(h.actions.get(id)?.status).toBe('consumed')
    await h.ended.promise
    expect(await competing).toBe('stopped')
    expect(competingDispatches).toBe(0)
    expect(h.oracle).toMatchObject({ dispatches: 1, effects: 1 })
    h.record(id)
  })

  it('retains known timeout facts in a bound reply with an unconfirmed lifecycle', async () => {
    const h = fixture()
    const backendResult = { exitCode: 124, timedOut: true }
    const original = h.rpc.getMockImplementation()!
    h.rpc.mockImplementation(async (input) => {
      await original(input)
      return { content: [{ type: 'text', text: 'Output drain expired.' }], structuredContent: {
        preparedId: h.snapshot.preparedId,
        requestId: h.request.id,
        executorInvoked: true,
        terminalLifecycle: 'unknown',
        backendResult,
      } }
    })
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(true)
    h.ready.release()
    await h.ended.promise

    const next = vi.fn(async () => {})
    await expect(h.runtime.executeInSlot(next)).rejects.toMatchObject({ executionState: 'not_executed' })
    expect(next).not.toHaveBeenCalled()
    expect(h.notices).toMatchObject([{ actionId: id, status: 'unknown', result: { structuredContent: { backendResult } } }])
    expect(h.actions.get(id)).toMatchObject({ status: 'consumed' })
    expect(h.actions.get(id)?.settlement).toBeUndefined()
    expect(h.oracle).toEqual({ dispatches: 1, effects: 1, discarded: 0 })
  })

  it('preserves two Session owners while sharing one actual execution queue', async () => {
    const a = fixture()
    const b = fixture({ actions: a.actions, runtime: a.runtime, sessionId: 'session-b' })
    const actionA = String(a.bind().structuredContent?.hostActionId)
    let observations = 0
    await a.runtime.executeInSlot(async () => {
      observations++
    })
    expect(observations).toBe(1)
    expect(a.actions.get(actionA)?.status).toBe('pending')
    const actionB = String(b.bind().structuredContent?.hostActionId)
    a.decision.release(true)
    await a.queued.promise
    b.decision.release(true)
    b.ready.release()
    expect(a.oracle.dispatches).toBe(0)
    expect(b.oracle.dispatches).toBe(0)
    expect(() => a.actions.consume(actionA, { argv: [a.snapshot.shell, ...a.snapshot.argv], attribution: b.attribution, kind: 'terminal' })).toThrow(/attribution/)
    a.ready.release()
    await a.ended.promise
    await b.ended.promise
    expect(a.oracle).toMatchObject({ dispatches: 1, effects: 1 })
    expect(b.oracle).toMatchObject({ dispatches: 1, effects: 1 })
    expect(a.actions.get(actionA)?.attribution.sessionId).toBe('session-a')
    expect(a.actions.get(actionB)?.attribution.sessionId).toBe('session-b')
    a.record(actionA)
    b.record(actionB)
  })
})
