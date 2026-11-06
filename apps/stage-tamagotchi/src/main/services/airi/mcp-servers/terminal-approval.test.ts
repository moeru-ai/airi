import type { TerminalSnapshot } from '@proj-airi/stage-shared/terminal-approval'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { terminalDiscardMethod, terminalExecuteMethod } from '@proj-airi/stage-shared/terminal-approval'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PendingActionManager } from '../computer-use/action-manager'
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
afterEach(() => {
  vi.useRealTimers()
  for (const record of evidence.splice(0))
    console.info(JSON.stringify({ boundary: 'Mock Main UI decision and controlled executor. No real approval or spawn.', ...record }))
})

function fixture() {
  const actions = new PendingActionManager()
  const attribution = { sessionId: 'session-a', turnId: 'turn-a', toolCallId: 'call-a', senderWebContentsId: 71 }
  const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Run the isolated fixture.' }, attribution.senderWebContentsId)
  const snapshot: TerminalSnapshot = { protocol: 'airi-terminal-approval/1', preparedId: 'prepared-a', requestId: request.id, toolCallId: attribution.toolCallId, command: 'fixture-command', shell: 'fixture-shell', argv: ['--command', 'fixture-command'], effectiveCwd: '/fixture', cwdSource: 'runner-state', executorPid: 101, executorPlatform: 'fixture', executorCwd: '/fixture', timeoutMs: 1000, detached: false, windowsHide: true }
  const decision = barrier<boolean>()
  const ready = barrier<void>()
  const queued = barrier<void>()
  const ended = barrier<void>()
  const oracle = { dispatches: 0, effects: 0, discarded: 0 }
  const lifetime = new AbortController()
  const rpc = vi.fn(async (input: { method: string }) => {
    if (input.method === terminalDiscardMethod) {
      oracle.discarded++
      return { discarded: true }
    }
    if (input.method !== terminalExecuteMethod)
      throw new Error('Unexpected private method.')
    oracle.dispatches++
    oracle.effects++
    return { content: [{ type: 'text', text: 'Executor returned. Business Oracle is separate.' }], structuredContent: { terminalLifecycle: 'closed', backendResult: { exitCode: 0, timedOut: false } } }
  })
  const client = new Client({ name: 'mock-main', version: '1.0.0' })
  client.request = rpc as Client['request']
  const connection = { client, serverName: 'fixture', nonce: 'c'.repeat(64), pid: 101, isCurrent: () => true }
  const options = { actions, present: vi.fn(() => decision.promise), executeInSlot: async <T>(operation: (signal: AbortSignal) => Promise<T>) => {
    queued.release()
    await ready.promise
    try {
      return await operation(lifetime.signal)
    }
    finally {
      ended.release()
    }
  } }
  const bind = () => bindTerminalApproval({ options, connection, attribution, payload: { name: 'fixture::terminal_exec', arguments: { command: 'fixture-command' }, requestId: request.id, attribution }, result: { content: [{ type: 'text', text: 'Approval required.' }], structuredContent: { status: 'approval_required', preparedTerminal: snapshot } } })
  function record(actionId: string) {
    evidence.push({ oracle: { ...oracle }, action: actions.get(actionId), rpcMethods: rpc.mock.calls.map(([input]) => input.method) })
  }
  return { actions, attribution, request, snapshot, decision, ready, queued, ended, oracle, rpc, connection, options, bind, record }
}

describe('main Terminal approval controller', () => {
  it('returns preparation, waits outside the slot, then consumes exactly once before dispatch', async () => {
    const h = fixture()
    const modelResult = h.bind()
    const id = String(modelResult.structuredContent?.hostActionId)
    expect(modelResult.content?.at(-1)?.text).toContain('preparation only')
    expect(h.oracle.dispatches).toBe(0)
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
    expect(() => h.actions.consume(id, { argv: [h.snapshot.shell, ...h.snapshot.argv], attribution: h.attribution, kind: 'terminal' })).toThrow(/replay/)
    h.record(id)
  })

  it('rejects through the UI decision without an executor invocation', async () => {
    const h = fixture()
    const id = String(h.bind().structuredContent?.hostActionId)
    h.decision.release(false)
    await vi.waitFor(() => expect(h.oracle.discarded).toBe(1))
    expect(h.actions.get(id)?.status).toBe('rejected')
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

  it.each(['executorPid', 'requestId', 'toolCallId', 'command'] as const)('refuses replaced %s before opening a decision', (field) => {
    const h = fixture()
    const original = { ...h.snapshot }
    Object.assign(h.snapshot, { [field]: field === 'executorPid' ? 102 : 'replacement' })
    expect(() => h.bind()).toThrow()
    expect(h.options.present).not.toHaveBeenCalled()
    expect(h.oracle).toMatchObject({ dispatches: 0, effects: 0 })
    evidence.push({ rejectedField: field, original, oracle: h.oracle })
  })
})
