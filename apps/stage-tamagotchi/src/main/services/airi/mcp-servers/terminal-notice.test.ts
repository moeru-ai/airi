import type { ChatHistoryItem, Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { TerminalNotice, TerminalSnapshot } from '@proj-airi/stage-shared/terminal-approval'

import { defineInvokeHandler } from '@moeru/eventa'
import { createChatOrchestratorRuntime, streamFrom } from '@proj-airi/core-agent'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { terminalOutcomeNotice } from '../../../../shared/eventa/terminal-approval'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { PendingActionManager } from '../computer-use/action-manager'
import { deliverTerminalNotice } from './terminal-notice'

const electron = vi.hoisted(() => ({ fromId: vi.fn(), fromWebContents: vi.fn() }))
vi.mock('electron', async () => ({
  ipcMain: new (await import('node:events')).EventEmitter(),
  BrowserWindow: { fromWebContents: electron.fromWebContents },
  webContents: { fromId: electron.fromId },
}))

const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }) }
const cleanup: Array<() => void> = []
afterEach(() => {
  for (const close of cleanup.splice(0))
    close()
  vi.clearAllMocks()
})

function fixture(projectToProvider = false) {
  // The Main window context and fake Renderer must share Electron's actual test IPC bus.
  const mainIpc = import('electron').then(module => module.ipcMain)
  const messages: Record<string, ChatHistoryItem[]> = { 'session-a': [], 'session-b': [] }
  const providerInputs: Conversation[] = []
  const providerRequests: unknown[] = []
  const projectionProvider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: {
    model,
    baseURL: 'https://example.com/v1/',
    fetch: async (_url: RequestInfo | URL, init?: RequestInit) => {
      providerRequests.push(JSON.parse(String(init?.body)))
      return new Response('data: {"choices":[{"index":0,"delta":{"content":"Controlled notice response."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    },
  } }) }
  const stream = vi.fn(async (_model: string, _provider: GenerationProvider, conversation: Conversation, options?: StreamOptions) => {
    providerInputs.push(structuredClone(conversation))
    if (projectToProvider) {
      await streamFrom({ model: _model, chatProvider: projectionProvider, conversation, options })
      return
    }
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'Controlled notice response.' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  function runtime() {
    return createChatOrchestratorRuntime({
      session: {
        commitUserMessage: async (id, message) => {
          const existing = messages[id].some(row => row.id === message.id)
          if (!existing)
            messages[id].push(message)
          return { status: existing ? 'existing' : 'inserted', messageId: message.id }
        },
        getSessionMessages: id => messages[id],
        commitAssistantMessage: async (id, message) => { messages[id].push(message) },
        getSessionGeneration: () => 1,
      },
      context: { ingest: vi.fn(), snapshot: () => ({}) },
      foregroundStream: { patch: vi.fn(), reset: vi.fn() },
      llm: { stream },
      getActiveSessionId: () => 'session-b',
      getActiveProvider: () => 'mock-provider',
      getSystemPromptSupplement: () => '',
      getContextWindow: () => -1,
    })
  }
  const core = runtime()
  cleanup.push(core.cancelPendingSends)
  return { mainIpc, messages, providerInputs, providerRequests, stream, core, runtime }
}

async function connect(status: TerminalNotice['status'] = 'executed', projectToProvider = false, exitCode = status === 'failed' ? 1 : 0) {
  const h = fixture(projectToProvider)
  const owner = createWindowIpc(await h.mainIpc)
  electron.fromId.mockReturnValue(owner.window.webContents)
  electron.fromWebContents.mockReturnValue(owner.window)
  const actions = new PendingActionManager()
  const attribution = { sessionId: 'session-a', turnId: 'original-turn', toolCallId: 'original-call', senderWebContentsId: owner.window.webContents.id }
  const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Original isolated fixture task.' }, attribution.senderWebContentsId)
  const snapshot: TerminalSnapshot = { protocol: 'airi-terminal-approval/1', preparedId: 'prepared-a', requestId: request.id, toolCallId: attribution.toolCallId, command: 'fixture-command', shell: 'fixture-shell', argv: ['--command', 'fixture-command'], effectiveCwd: '/fixture', cwdSource: 'runner-state', executorPid: 101, executorPlatform: 'fixture', executorCwd: '/fixture', timeoutMs: 1000, detached: false, windowsHide: true }
  const action = actions.createTerminalAction({ requestId: request.id, attribution, snapshot, serverName: 'fixture', arguments: { command: snapshot.command } })
  if (status === 'executed' || status === 'failed' || status === 'unknown') {
    actions.approve(action.id)
    actions.consume(action.id, { argv: action.argv, attribution, kind: 'terminal' })
    if (status !== 'unknown')
      actions.settle(action.id, { outcome: status === 'executed' ? 'success' : 'failed', exitCode })
  }
  else if (status === 'rejected') {
    actions.reject(action.id)
  }
  else if (status === 'cancelled') {
    actions.cancel(action.id)
  }
  else {
    const now = vi.spyOn(Date, 'now').mockReturnValue(action.expiresAt)
    actions.get(action.id)
    now.mockRestore()
  }
  const notice: TerminalNotice = { actionId: action.id, requestId: request.id, sessionId: attribution.sessionId, turnId: attribution.turnId, toolCallId: attribution.toolCallId, command: snapshot.command, effectiveCwd: snapshot.effectiveCwd, status, result: status === 'executed' || status === 'failed' ? { backendResult: { exitCode: status === 'failed' ? 1 : 0 }, executorInvoked: true } : undefined }
  let activeCore = h.core
  const completions: Promise<void>[] = []
  const received = Promise.withResolvers<void>()
  defineInvokeHandler(owner.context, terminalOutcomeNotice, async (input, options) => {
    const messageId = `terminal:${input.actionId}`
    const turn = activeCore.submit(JSON.stringify(input), { model: 'mock-notice', chatProvider: provider, messageId, signal: options?.abortController?.signal, notice: { source: 'airi:terminal-settlement' } }, input.sessionId)
    completions.push(turn.done.catch(() => {}))
    received.resolve()
    const receipt = await turn.accepted
    return { status: 'stored' as const, ...receipt }
  })
  const deliver = (input = notice) => deliverTerminalNotice(actions, input)
  const record = () => console.info(JSON.stringify({ boundary: 'Mock Electron IPC and real Core Runtime with Mock provider. No executor or UI authorization.', notice, messages: h.messages, providerInputs: h.providerInputs, providerCalls: h.stream.mock.calls.length }))
  return { ...h, owner, actions, request, attribution, notice, completions, deliver, record, received, replaceCore: () => {
    activeCore = h.runtime()
  } }
}

describe('host Terminal notice routing', () => {
  it.each([{ exitCode: 0, timedOut: false }, { exitCode: 1, timedOut: false }, { exitCode: 124, timedOut: true }])('preserves scoped Terminal facts %j in the actual next provider request', async (backend) => {
    const h = await connect(backend.exitCode === 0 ? 'executed' : 'failed', true, backend.exitCode)
    h.notice.result = {
      content: [{ type: 'text', text: 'Terminal backend: local-shell-runner. executionTarget and context describe the desktop backend.' }],
      structuredContent: { terminalBackend: 'local-shell-runner', executionTarget: { mode: 'dry-run' }, context: { available: false }, backendResult: { ...backend, effectiveCwd: '/fixture' } },
    }
    await h.deliver()
    await Promise.all(h.completions)
    console.info(JSON.stringify({ boundary: 'Controlled Terminal notice and Electron IPC. Real Core, SDK and provider request projection. No native execution.', backend, providerRequests: h.providerRequests, action: h.actions.get(h.notice.actionId) }))

    expect(h.providerRequests).toHaveLength(1)
    expect(h.providerRequests[0]).toMatchObject({ messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: expect.stringContaining(JSON.stringify(h.notice)) })]) })
    expect(JSON.stringify(h.providerRequests[0])).toContain('Notice from airi:terminal-settlement, not a message from the owner.')
    expect(h.actions.get(h.notice.actionId)?.settlement).toMatchObject({ executionState: 'executed', exitCode: backend.exitCode })
    expect(h.messages['session-b']).toEqual([])
    await h.deliver()
    await Promise.all(h.completions)
    expect(h.providerRequests).toHaveLength(1)
  })

  it.each(['executed', 'failed', 'rejected', 'expired', 'unknown'] as const)('persists %s in the original Session and starts a distinct notice turn', async (status) => {
    const h = await connect(status)
    const receipt = await h.deliver()
    await Promise.all(h.completions)
    expect(receipt).toMatchObject({ status: 'stored', sessionId: 'session-a', messageId: `terminal:${h.notice.actionId}` })
    expect(h.messages['session-b']).toEqual([])
    const notice = h.messages['session-a'].find(message => message.id === receipt.messageId)
    expect(notice).toMatchObject({ role: 'user', notice: { source: 'airi:terminal-settlement' } })
    expect(JSON.stringify(h.providerInputs)).toContain(status)
    expect(h.stream).toHaveBeenCalledOnce()
    h.record()
  })

  it('does not generate a replacement turn after explicit cancellation', async () => {
    const h = await connect('cancelled')
    h.actions.cancelRequest(h.request.id, h.attribution.senderWebContentsId)
    expect(await h.deliver()).toMatchObject({ status: 'suppressed' })
    expect(h.stream).not.toHaveBeenCalled()
    expect(h.messages['session-a']).toEqual([])
    h.record()
  })

  it('reuses the persistent message identity across duplicate delivery and Runtime replacement', async () => {
    const h = await connect()
    await h.deliver()
    await Promise.all(h.completions)
    h.replaceCore()
    await h.deliver()
    await Promise.all(h.completions)
    expect(h.messages['session-a'].filter(message => message.id === `terminal:${h.notice.actionId}`)).toHaveLength(1)
    expect(h.stream).toHaveBeenCalledOnce()
    h.record()
  })

  it('does not start a new turn when the original request was cancelled after dispatch', async () => {
    const h = await connect('executed')
    h.actions.cancelRequest(h.request.id, h.attribution.senderWebContentsId)
    await expect(h.deliver()).rejects.toThrow(/cancelled/)
    expect(h.stream).not.toHaveBeenCalled()
    expect(h.messages['session-a']).toEqual([])
  })

  it('deduplicates concurrent deliveries while the first generation is still running', async () => {
    const h = await connect()
    const held = Promise.withResolvers<void>()
    h.stream.mockImplementationOnce(async () => held.promise)
    await h.deliver()
    const duplicate = h.deliver()
    held.resolve()
    await duplicate
    await Promise.all(h.completions)
    expect(h.messages['session-a'].filter(message => message.id === `terminal:${h.notice.actionId}`)).toHaveLength(1)
    expect(h.stream).toHaveBeenCalledOnce()
    h.record()
  })

  it.each(['sessionId', 'turnId', 'toolCallId', 'requestId', 'command'] as const)('rejects replaced %s without calling a provider', async (field) => {
    const h = await connect()
    await expect(h.deliver({ ...h.notice, [field]: 'foreign' })).rejects.toThrow(/saved Host action/)
    expect(h.stream).not.toHaveBeenCalled()
  })

  it('does not route an unavailable original Runtime to the active Session', async () => {
    const h = await connect()
    electron.fromWebContents.mockReturnValue(null)
    await expect(h.deliver()).rejects.toThrow(/unavailable/)
    expect(h.stream).not.toHaveBeenCalled()
    expect(h.messages['session-b']).toEqual([])
  })

  it('queues behind the original Session while another Session can continue', async () => {
    const h = await connect()
    const held = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    h.stream.mockImplementationOnce(async () => {
      started.resolve()
      await held.promise
    })
    const original = h.core.submit('Existing turn.', { model: 'existing', chatProvider: provider, messageId: 'existing-turn' }, 'session-a')
    await started.promise
    const notice = h.deliver()
    await h.core.submit('Unrelated read-only turn.', { model: 'other', chatProvider: provider, messageId: 'other-turn' }, 'session-b').done
    expect(h.messages['session-a'].some(message => message.id === `terminal:${h.notice.actionId}`)).toBe(false)
    held.resolve()
    await original.done
    await notice
    await Promise.all(h.completions)
    expect(h.messages['session-a'].filter(message => message.role === 'user').map(message => message.id)).toEqual(['existing-turn', `terminal:${h.notice.actionId}`])
    expect(h.messages['session-b'].filter(message => message.role === 'user').map(message => message.id)).toEqual(['other-turn'])
    h.record()
  })

  it('starts no notice generation when the original request is cancelled after delivery queued behind a busy Session', async () => {
    const h = await connect()
    const held = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    h.stream.mockImplementationOnce(async () => {
      started.resolve()
      await held.promise
    })
    const original = h.core.submit('Existing turn.', { model: 'existing', chatProvider: provider, messageId: 'existing-turn' }, 'session-a')
    await started.promise
    const delivery = h.deliver().then(value => ({ receipt: value }), error => ({ error: String(error) }))
    await h.received.promise
    h.actions.cancelRequest(h.request.id, h.attribution.senderWebContentsId)
    held.resolve()
    await original.done
    const result = await delivery
    await Promise.all(h.completions)
    h.record()
    expect(h.messages['session-a'].some(message => message.id === `terminal:${h.notice.actionId}`)).toBe(false)
    expect(h.stream).toHaveBeenCalledOnce()
    expect(result).toHaveProperty('error')
  })
})
