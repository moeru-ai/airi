import type { ExecFileOptions } from 'node:child_process'

import type { ChatHistoryItem } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { ComputerUseRunInput } from '../../../../shared/eventa/computer-use'
import type { InvocationAttribution } from './attribution'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { defineInvoke } from '@moeru/eventa'
import { createContext as createMainContext } from '@moeru/eventa/adapters/electron/main'
import { createChatOrchestratorRuntime } from '@proj-airi/core-agent'
import { useLLM } from '@proj-airi/stage-ui/stores/ai/chat-llm/llm'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-resolver'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { COMPUTER_USE_READ_IMAGE_TOOL_NAME, COMPUTER_USE_TOOL_NAME, computerUseTools } from '../../../../renderer/stores/tools/builtin/computer-use'
import { computerUseCancel, computerUsePreviewImage, computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
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

/** Deterministic SSE provider at the network boundary. Chat, tool resolution and IPC remain production code. */
function providerFor(calls: Array<{ name: string, input: unknown }>) {
  const requests: unknown[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    const index = requests.length - 1
    const call = calls[index]
    const delta = call
      ? { tool_calls: [{ index: 0, id: `call-${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.input) } }] }
      : { content: 'Observation completed.' }
    const chunk = { choices: [{ index: 0, delta, finish_reason: call ? 'tool_calls' : 'stop' }] }
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/v1/', fetch } }),
  }
  return { provider, requests, fetch }
}

describe('chat to computer use integration with simulated network and OS boundaries', () => {
  let directory: string
  let storeRoot: string
  let screenshot: string
  let host: ReturnType<typeof setupComputerUse>
  let renderer: ReturnType<typeof createWindowIpc>
  let ipcMain: EventEmitter
  let pinia: ReturnType<typeof createPinia>
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64')

  function origin(turnId = 'turn-a', senderWebContentsId = renderer.window.webContents.id): InvocationAttribution {
    return { sessionId: 'session-a', turnId, toolCallId: 'call-a', senderWebContentsId }
  }

  function approved(attribution = origin()) {
    const action = host.actionManager.createPendingAction({ argv: ['invoke', 'app.activate', 'Calculator'], attribution })
    host.actionManager.approve(action.id)
    return action
  }

  function invoke(input: ComputerUseRunInput) {
    return defineInvoke(renderer.context, computerUseRun)(input)
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)
    directory = await mkdtemp(join(tmpdir(), 'airi-chat-integration-'))
    storeRoot = join(directory, 'store')
    screenshot = join(storeRoot, 'capture.png')
    await mkdir(storeRoot)
    await writeFile(screenshot, png)
    ipcMain = new EventEmitter()
    host = setupComputerUse(createMainContext(ipcMain as never).context, { binaryPath: 'test-auv', storeRoot })
    renderer = createWindowIpc(ipcMain)
    external.start.mockResolvedValue({
      connectionOptions: { credential: 'test-launcher-token' },
      endpoints: ['ipc://test-auv'],
      exited: new Promise(() => {}),
      stop: vi.fn(),
    })
    external.execute.mockImplementation((_file, args) => {
      const output = args.includes('window.list') ? [{ id: 1, title: 'Test application' }] : { file_path: screenshot }
      return execution({ stdout: JSON.stringify(output), stderr: '' })
    })
    const tools = await computerUseTools({ context: renderer.context })
    useLlmToolsStore(pinia).addTools(...tools.map(tool => ({
      ...tool,
      id: `tamagotchi:${tool.function.name}`,
      defaultActive: false,
      requiresExplicitSelection: true,
    })))
  })

  afterEach(async () => {
    await emitAppBeforeQuit()
    vi.useRealTimers()
    await rm(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function chatHarness() {
    const histories = new Map<string, ChatHistoryItem[]>()
    const activeSession = ref('session-a')
    const llm = useLLM(pinia)
    let nextId = 0
    const history = (id: string) => {
      let messages = histories.get(id)
      if (!messages) {
        messages = []
        histories.set(id, messages)
      }
      return messages
    }
    const chat = createChatOrchestratorRuntime({
      session: {
        getSessionMessages: history,
        getSessionGeneration: () => 0,
        commitUserMessage: async (id, message) => {
          history(id).push(message)
          return { status: 'inserted', messageId: message.id }
        },
        commitAssistantMessage: async (id, message) => { history(id).push(message) },
      },
      context: { ingest: vi.fn(), snapshot: () => ({}) },
      foregroundStream: { patch: vi.fn(), reset: vi.fn() },
      llm,
      getActiveSessionId: () => activeSession.value,
      getActiveProvider: () => 'test-provider',
      createId: () => `generated-${nextId++}`,
    })
    const tools = useLlmToolsStore(pinia).getToolsByNames(COMPUTER_USE_TOOL_NAME, COMPUTER_USE_READ_IMAGE_TOOL_NAME)
    return { chat, history, activeSession, tools }
  }

  it('generates correlation in Chat and returns all three read-only results to the original history', async () => {
    const harness = chatHarness()
    const waitingApproval = approved(origin('waiting-for-approval'))
    const model = providerFor([
      { name: COMPUTER_USE_TOOL_NAME, input: { argv: ['invoke', 'window.list'] } },
      { name: COMPUTER_USE_TOOL_NAME, input: { argv: ['invoke', 'display.capture'] } },
      { name: COMPUTER_USE_READ_IMAGE_TOOL_NAME, input: { path: screenshot } },
    ])
    const run = vi.spyOn(host.getRuntime(), 'run')
    const read = vi.spyOn(host.getRuntime(), 'readImage')
    const send = harness.chat.submit('Observe the desktop.', { model: 'test', chatProvider: model.provider, tools: harness.tools })
    const accepted = await send.accepted
    harness.activeSession.value = 'session-c'
    await send.done

    expect(run.mock.calls[0]).toEqual([
      { argv: ['invoke', 'window.list'], actionId: undefined, attribution: { sessionId: 'session-a', turnId: accepted.messageId, toolCallId: 'call-0' } },
      renderer.window.webContents.id,
    ])
    expect(read.mock.calls[0]?.[0]).toMatchObject({ attribution: { sessionId: 'session-a', turnId: accepted.messageId, toolCallId: 'call-2' } })
    expect(model.requests).toHaveLength(4)
    expect(model.requests[1]).toMatchObject({ messages: expect.arrayContaining([expect.objectContaining({ role: 'tool', tool_call_id: 'call-0', content: expect.stringContaining('Test application') })]) })
    expect(harness.history('session-a').some(message => message.role === 'assistant' && message.content === 'Observation completed.')).toBe(true)
    expect(harness.history('session-c')).toEqual([])
    expect(host.actionManager.get(waitingApproval.id)?.status).toBe('approved')
  })

  it('keeps concurrent Chat sessions bound while the visible session changes', async () => {
    const harness = chatHarness()
    const modelA = providerFor([{ name: COMPUTER_USE_TOOL_NAME, input: { argv: ['invoke', 'window.list'] } }])
    const modelB = providerFor([{ name: COMPUTER_USE_TOOL_NAME, input: { argv: ['invoke', 'display.capture'] } }])
    const run = vi.spyOn(host.getRuntime(), 'run')
    const a = harness.chat.submit('Observe A.', { model: 'test', chatProvider: modelA.provider, tools: harness.tools }, 'session-a')
    const b = harness.chat.submit('Observe B.', { model: 'test', chatProvider: modelB.provider, tools: harness.tools }, 'session-b')
    const [acceptedA, acceptedB] = await Promise.all([a.accepted, b.accepted])
    harness.activeSession.value = 'session-c'
    await Promise.all([a.done, b.done])

    expect(run.mock.calls.map(([input]) => input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ attribution: { sessionId: 'session-a', turnId: acceptedA.messageId, toolCallId: 'call-0' } }),
      expect.objectContaining({ attribution: { sessionId: 'session-b', turnId: acceptedB.messageId, toolCallId: 'call-0' } }),
    ]))
    expect(harness.history('session-a').filter(message => message.role === 'assistant')).toHaveLength(1)
    expect(harness.history('session-b').filter(message => message.role === 'assistant')).toHaveLength(1)
    expect(harness.history('session-c')).toEqual([])
  })

  it('propagates real Chat turn cancellation to waiting host approvals', async () => {
    const harness = chatHarness()
    const waiting = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const model = providerFor([{ name: COMPUTER_USE_TOOL_NAME, input: { argv: ['invoke', 'window.list'] } }])
    const fetch = model.fetch
    const pausedFetch: typeof globalThis.fetch = async (url, init) => {
      if (model.requests.length > 0) {
        waiting.resolve()
        await resume.promise
      }
      return fetch(url, init)
    }
    const provider: GenerationProvider = {
      generation: modelId => ({
        protocol: 'chat-completions',
        config: {
          model: modelId,
          baseURL: 'https://example.com/v1/',
          fetch: pausedFetch,
        },
      }),
    }
    const send = harness.chat.submit('Observe until cancelled.', { model: 'test', chatProvider: provider, tools: harness.tools })
    const done = send.done.catch(error => error)
    const accepted = await send.accepted
    await waiting.promise
    const action = approved({ ...origin(), turnId: accepted.messageId })
    const otherTurn = approved(origin('another-turn'))
    harness.chat.cancelTurn({ sessionId: 'session-a', turnId: accepted.messageId })
    resume.resolve()
    await done

    await vi.waitFor(() => expect(host.actionManager.get(action.id)?.status).toBe('cancelled'))
    expect(host.actionManager.get(otherTurn.id)?.status).toBe('approved')
    expect(external.execute).toHaveBeenCalledTimes(1)
  })

  it('omits computer tools when the request does not select them', async () => {
    const harness = chatHarness()
    const model = providerFor([])
    await harness.chat.ingest('Reply without desktop access.', { model: 'test', chatProvider: model.provider })
    expect(JSON.stringify(model.requests[0])).not.toContain('"computer_use"')
    expect(JSON.stringify(model.requests[0])).not.toContain('"computer_use_read_image"')
    expect(external.execute).not.toHaveBeenCalled()
  })

  it('ignores an approval ID injected into model arguments', async () => {
    const action = approved()
    const [tool] = await computerUseTools({ context: renderer.context })
    const options = { messages: [], toolCallId: 'call-a', attribution: origin() }
    await expect(tool!.execute({ argv: action.argv, actionId: action.id }, options)).rejects.toThrow(/actionId missing/)
    expect(host.actionManager.get(action.id)?.status).toBe('approved')
    expect(external.execute).not.toHaveBeenCalled()
    expect(tool!.function.parameters).toMatchObject({ properties: { argv: expect.anything() } })
    expect(tool!.function.parameters.properties).not.toHaveProperty('actionId')
  })

  it('cancels a queued approval without cancelling another turn or window', async () => {
    const blocker = Promise.withResolvers<CliResult>()
    external.execute.mockImplementationOnce(() => execution(blocker.promise))
    const observation = invoke({ argv: ['invoke', 'window.list'], attribution: origin('observer') })
    await vi.waitFor(() => expect(external.execute).toHaveBeenCalledTimes(1))
    const action = approved()
    const otherTurn = approved(origin('turn-b'))
    const otherWindow = createWindowIpc(ipcMain)
    const otherSource = approved(origin('turn-a', otherWindow.window.webContents.id))
    const run = vi.spyOn(host.getRuntime(), 'run')
    const queued = invoke({ argv: [...action.argv], actionId: action.id, attribution: origin() }).catch(error => error)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(host.actionManager.get(action.id)?.status).toBe('approved')
    const count = await defineInvoke(renderer.context, computerUseCancel)({ attribution: origin() })
    blocker.resolve({ stdout: '[]', stderr: '' })
    await observation
    expect(await queued).toMatchObject({ message: expect.stringContaining('cancelled') })
    expect(count).toBe(1)
    expect(host.actionManager.get(otherTurn.id)?.status).toBe('approved')
    expect(host.actionManager.get(otherSource.id)?.status).toBe('approved')
    expect(external.execute).toHaveBeenCalledTimes(1)
  })

  it('rechecks expiry after waiting for the execution queue', async () => {
    const blocker = Promise.withResolvers<CliResult>()
    external.execute.mockImplementationOnce(() => execution(blocker.promise))
    const observation = invoke({ argv: ['invoke', 'window.list'], attribution: origin() })
    await vi.waitFor(() => expect(external.execute).toHaveBeenCalledTimes(1))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1000)
    const action = host.actionManager.createPendingAction({ argv: ['invoke', 'app.activate', 'Calculator'], attribution: origin(), ttlMs: 10 })
    host.actionManager.approve(action.id)
    const run = vi.spyOn(host.getRuntime(), 'run')
    const queued = invoke({ argv: [...action.argv], actionId: action.id, attribution: origin() }).catch(error => error)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    vi.setSystemTime(1010)
    blocker.resolve({ stdout: '[]', stderr: '' })
    await observation
    expect(await queued).toMatchObject({ message: expect.stringContaining('expired') })
    expect(external.execute).toHaveBeenCalledTimes(1)
  })

  it.each(['startup', 'spawn', 'timeout'])('settles %s failures once without restoring the grant', async (failure) => {
    const error = new Error(`${failure} failed`)
    if (failure === 'timeout')
      Object.assign(error, { code: 1, killed: true, stdout: 'partial output', stderr: 'timed out' })
    if (failure === 'spawn')
      Object.assign(error, { code: 'ENOENT' })
    if (failure === 'startup')
      external.start.mockRejectedValueOnce(error)
    else
      external.execute.mockImplementationOnce(() => execution(Promise.reject(error)))
    const action = approved()
    const input = { argv: [...action.argv], actionId: action.id, attribution: origin() }
    await expect(invoke(input)).rejects.toThrow(error.message)
    expect(host.actionManager.get(action.id)).toMatchObject({ status: 'consumed', settlement: { outcome: 'failed', error: error.message } })
    await expect(invoke(input)).rejects.toThrow(/already been consumed/)
  })

  it('preserves a normal nonzero CLI result and settles its consumed approval', async () => {
    const error = Object.assign(new Error('CLI failed'), { code: 3, stdout: '{"failure_details":"test failure"}', stderr: 'test failure' })
    external.execute.mockImplementationOnce(() => execution(Promise.reject(error)))
    const action = approved()
    const result = await invoke({ argv: [...action.argv], actionId: action.id, attribution: origin() })
    expect(result).toMatchObject({ exitCode: 3, output: { failure_details: 'test failure' }, stderr: 'test failure' })
    expect(host.actionManager.get(action.id)?.settlement).toMatchObject({ outcome: 'failed', exitCode: 3 })
  })

  it('holds the serial slot and reports the real result when a running turn is cancelled', async () => {
    const blocker = Promise.withResolvers<CliResult>()
    external.execute.mockImplementationOnce(() => execution(blocker.promise))
    const action = approved()
    const pending = invoke({ argv: [...action.argv], actionId: action.id, attribution: origin() })
    await vi.waitFor(() => expect(external.execute).toHaveBeenCalledTimes(1))
    const count = await defineInvoke(renderer.context, computerUseCancel)({ attribution: origin() })
    const observation = invoke({ argv: ['invoke', 'window.list'], attribution: origin('next-turn') })
    expect(count).toBe(0)
    expect(host.actionManager.get(action.id)?.settlement).toBeUndefined()
    expect(external.execute).toHaveBeenCalledTimes(1)
    blocker.resolve({ stdout: '{}', stderr: '' })
    await pending
    await observation
    expect(host.actionManager.get(action.id)?.settlement?.outcome).toBe('success')
    expect(external.execute).toHaveBeenCalledTimes(2)
  })

  it('keeps request abort connected between tool calls and isolates its turn', async () => {
    const controller = new AbortController()
    const tools = await resolveLlmTools({
      activeTools: useLlmToolsStore(pinia).getToolsByNames(COMPUTER_USE_TOOL_NAME),
      attribution: { sessionId: 'session-a', turnId: 'turn-a' },
    })
    const tool = tools.find(tool => tool.function.name === COMPUTER_USE_TOOL_NAME)!
    await tool.execute({ argv: ['invoke', 'window.list'] }, { messages: [], toolCallId: 'call-a', abortSignal: controller.signal })
    const action = approved()
    const otherTurn = approved(origin('turn-b'))
    controller.abort()
    await vi.waitFor(() => expect(host.actionManager.get(action.id)?.status).toBe('cancelled'))
    expect(host.actionManager.get(otherTurn.id)?.status).toBe('approved')
  })

  it('rejects an already aborted tool before any executor call', async () => {
    const action = approved()
    const [tool] = await computerUseTools({ context: renderer.context })
    const controller = new AbortController()
    controller.abort(new Error('Request cancelled'))
    const options = { messages: [], toolCallId: 'call-a', abortSignal: controller.signal, attribution: origin(), actionId: action.id }
    await expect(tool!.execute({ argv: action.argv }, options)).rejects.toThrow('Request cancelled')
    expect(host.actionManager.get(action.id)?.status).toBe('cancelled')
    expect(external.execute).not.toHaveBeenCalled()
  })

  it('invalidates approvals on renderer destruction', async () => {
    await invoke({ argv: ['invoke', 'window.list'], attribution: origin() })
    const action = approved()
    renderer.window.webContents.emit('destroyed')
    expect(host.actionManager.get(action.id)?.status).toBe('cancelled')
  })

  it('keeps sensitive input closed even when a target flag and matching approval exist', async () => {
    const action = host.actionManager.createPendingAction({ argv: ['invoke', 'input.typeText', 'test', '--target', 'app:notepad'], attribution: origin() })
    host.actionManager.approve(action.id)
    await expect(invoke({ argv: [...action.argv], actionId: action.id, attribution: origin() })).rejects.toThrow(/Target-bound input execution is not enabled/)
    expect(host.actionManager.get(action.id)?.status).toBe('approved')
    expect(external.execute).not.toHaveBeenCalled()
  })

  it('rejects another renderer even when its payload claims the approved source', async () => {
    const action = approved()
    const other = createWindowIpc(ipcMain)
    await expect(defineInvoke(other.context, computerUseRun)({
      argv: [...action.argv],
      actionId: action.id,
      attribution: origin(),
    })).rejects.toThrow(/senderWebContentsId differs/)
    expect(await defineInvoke(other.context, computerUseCancel)({ attribution: origin() })).toBe(0)
    expect(host.actionManager.get(action.id)?.status).toBe('approved')
    expect(external.execute).not.toHaveBeenCalled()
  })

  it('does not settle a supplied approval ID while executing an unrelated observation', async () => {
    const action = approved()
    await invoke({ argv: ['invoke', 'window.list'], actionId: action.id, attribution: origin('another-turn') })
    expect(host.actionManager.get(action.id)?.status).toBe('approved')
    expect(host.actionManager.get(action.id)?.settlement).toBeUndefined()
  })

  it('previews history under the shared artifact policy without fake model attribution', async () => {
    const preview = defineInvoke(renderer.context, computerUsePreviewImage)
    expect(await preview({ path: screenshot })).toBe(`data:image/png;base64,${png.toString('base64')}`)
    await expect(defineInvoke(renderer.context, computerUseReadImage)({ path: screenshot })).rejects.toThrow(/attribution is required/)
    const outside = join(directory, 'outside.png')
    await writeFile(outside, png)
    await expect(preview({ path: outside })).rejects.toThrow(/Only screenshots/)
    expect(external.execute).not.toHaveBeenCalled()
  })

  it('rejects partial correlation for model observations and image reads', async () => {
    const attribution = { sessionId: 'session-a' }
    await expect(invoke({ argv: ['invoke', 'window.list'], attribution })).rejects.toThrow(/original turn ID and tool-call ID/)
    await expect(defineInvoke(renderer.context, computerUseReadImage)({ path: screenshot, attribution })).rejects.toThrow(/original turn ID and tool-call ID/)
    expect(external.execute).not.toHaveBeenCalled()
  })
})
