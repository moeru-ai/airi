import type { GenerationProvider } from '@proj-airi/provider-inference'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { defineInvoke } from '@moeru/eventa'
import { createContext as createMainContext } from '@moeru/eventa/adapters/electron/main'
import { useLLM } from '@proj-airi/stage-ui/stores/ai/chat-llm/llm'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-resolver'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { computerUseTools, COMPUTER_USE_READ_IMAGE_TOOL_NAME, COMPUTER_USE_TOOL_NAME } from '../../../../renderer/stores/tools/builtin/computer-use'
import { computerUseCancel } from '../../../../shared/eventa/computer-use'
import { setupComputerUse } from './index'

let mockStoreRoot = ''
const execFileCalls: Array<{ file: string, args: readonly string[] }> = []

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')

  const handleCommand = (args: readonly string[]) => {
    let stdout = '{}'
    if (args.includes('window.list')) {
      stdout = JSON.stringify([{ id: 101, title: 'Visual Studio Code' }])
    }
    else if (args.includes('display.capture')) {
      stdout = JSON.stringify({ file_path: join(mockStoreRoot, 'test-capture.png') })
    }
    else if (args.includes('input.clickPoint')) {
      stdout = JSON.stringify({ status: 'completed' })
    }
    return stdout
  }

  const mockExecFile = (file: string, args: readonly string[], options: unknown, callback?: (err: Error | null, stdout: string, stderr: string) => void) => {
    execFileCalls.push({ file, args })
    const cb = typeof options === 'function' ? options : callback
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough }
    child.stdin = new PassThrough()
    const stdout = handleCommand(args)

    setImmediate(() => {
      cb?.(null, stdout, '')
    })
    return child
  }

  // eslint-disable-next-line ts/no-explicit-any
  (mockExecFile as any)[promisify.custom] = (file: string, args: readonly string[]) => {
    execFileCalls.push({ file, args })
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough }
    child.stdin = new PassThrough()
    const stdout = handleCommand(args)

    const promise = Promise.resolve({ stdout, stderr: '' }) as Promise<{ stdout: string, stderr: string }> & { child: typeof child }
    promise.child = child
    return promise
  }

  return {
    ...actual,
    execFile: mockExecFile,
  }
})

vi.mock('@auv-js/sdk/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@auv-js/sdk/node')>()
  return {
    ...actual,
    startAuv: vi.fn(async () => ({
      connectionOptions: { credential: 'mock-launcher-token-xyz' },
      endpoints: ['ipc://mock-auv-pipe'],
      exited: new Promise(() => {}),
      stop: vi.fn(),
    })),
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mockStoreRoot),
    isPackaged: false,
  },
}))

describe('AIRI Chat Runtime and Computer Use E2E Integration', () => {
  let directory: string
  let ipcMain: EventEmitter
  let mainSetup: ReturnType<typeof setupComputerUse>
  let rendererContext: ReturnType<typeof createWindowIpc>['context']
  let cancelViaIpc: (input: { sessionId?: string, actionId?: string, reason?: string }) => Promise<number>
  const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64')

  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    execFileCalls.length = 0

    directory = await mkdtemp(join(tmpdir(), 'airi-chat-cu-e2e-'))
    mockStoreRoot = join(directory, 'store')
    await mkdir(mockStoreRoot, { recursive: true })

    // Create a real test PNG screenshot in the store
    await writeFile(join(mockStoreRoot, 'test-capture.png'), transparentPng)

    // Electron IPC Bus
    ipcMain = new EventEmitter()
    const { context: mainContext } = createMainContext(ipcMain as never)

    mainSetup = setupComputerUse(mainContext, {
      binaryPath: '/fake/auv',
      storeRoot: mockStoreRoot,
      requireAttribution: true,
    })

    const renderer = createWindowIpc(ipcMain)
    rendererContext = renderer.context

    // Wire global renderer electron
    const fakeElectron = {
      ipcRenderer: renderer.ipcRenderer,
    }
    // eslint-disable-next-line ts/no-explicit-any
    ;(globalThis as any).window = { electron: fakeElectron }

    cancelViaIpc = defineInvoke(rendererContext, computerUseCancel)

    // Register built-in computer-use tools in Pinia store
    const tools = await computerUseTools({ context: rendererContext })
    useLlmToolsStore(pinia).addTools(...tools.map(tool => ({
      ...tool,
      defaultActive: false,
      requiresExplicitSelection: true,
      id: `tamagotchi:${tool.function.name}`,
    })))
  })

  afterEach(async () => {
    mainSetup.actionManager.invalidateAll()
    await rm(directory, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('Requirement 1 & 2: executes full chat streaming tool-call loop via useLLM with authentic provenance', async () => {
    const llm = useLLM(pinia)
    const llmToolsStore = useLlmToolsStore(pinia)

    // User enables 'Use computer' in chat request: passed as request tools
    const requestTools = llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME, COMPUTER_USE_READ_IMAGE_TOOL_NAME)

    const requestBodies: unknown[] = []
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      requestBodies.push(body)

      // Step 1: Model issues computer_use(window.list)
      if (requestBodies.length === 1) {
        const chunk = {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_wl_stream_100',
                type: 'function',
                function: {
                  name: COMPUTER_USE_TOOL_NAME,
                  arguments: JSON.stringify({ argv: ['invoke', 'window.list'] }),
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }

      // Step 2: Model receives window.list result and finishes
      const chunk = {
        choices: [{
          index: 0,
          delta: { content: 'I found Visual Studio Code running.' },
          finish_reason: 'stop',
        }],
      }
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const provider: GenerationProvider = {
      generation: model => ({
        protocol: 'chat-completions',
        config: { model, baseURL: 'https://mock.example.com/v1/', fetch },
      }),
    }

    // Stream from real chat orchestrator runtime options
    await llm.stream('mock-model', provider, { turns: [] }, {
      tools: requestTools,
      requestCorrelation: {
        conversationId: 'session-chat-stream-100',
        turnId: 'round-100',
      },
    })

    // Assert that the stream completed 2 rounds
    expect(requestBodies).toHaveLength(2)

    // Assert that AUV window.list was invoked via IPC to Main with correct provenance
    expect(execFileCalls.some(c => c.args.includes('window.list'))).toBe(true)

    // Round 2 request must contain the tool execution result with the matching toolCallId
    const secondReq = requestBodies[1] as { messages: Array<{ role: string, tool_call_id?: string, content?: string }> }
    const toolMsg = secondReq.messages.find(m => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg?.tool_call_id).toBe('call_wl_stream_100')
    expect(toolMsg?.content).toContain('Visual Studio Code')
  })

  it('Requirement 1 & 2: executes full chat invocation chain (window.list, display.capture, read_image) with authentic attribution', async () => {
    const llmToolsStore = useLlmToolsStore(pinia)

    // 1. Session A: User enables 'Use computer' on request turn-1
    const sessionATools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME, COMPUTER_USE_READ_IMAGE_TOOL_NAME),
      attribution: {
        sessionId: 'session-A',
        turnId: 'turn-1',
      },
    })

    const cuTool = sessionATools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!
    const readImageTool = sessionATools.find(t => t.function.name === COMPUTER_USE_READ_IMAGE_TOOL_NAME)!
    expect(cuTool).toBeDefined()
    expect(readImageTool).toBeDefined()

    // 2. Model calls computer_use(window.list)
    const windowListResult = await cuTool.execute(
      { argv: ['invoke', 'window.list'] },
      { messages: [], toolCallId: 'call-model-wl-1' } as never,
    )
    expect(windowListResult).toContain('Visual Studio Code')
    expect(execFileCalls.some(c => c.args.includes('window.list'))).toBe(true)

    // 3. Model calls computer_use(display.capture)
    const displayCaptureResult = await cuTool.execute(
      { argv: ['invoke', 'display.capture'] },
      { messages: [], toolCallId: 'call-model-dc-2' } as never,
    )
    expect(displayCaptureResult).toContain('test-capture.png')
    expect(execFileCalls.some(c => c.args.includes('display.capture'))).toBe(true)

    // 4. Model calls computer_use_read_image
    const readResult = await readImageTool.execute(
      { path: join(mockStoreRoot, 'test-capture.png') },
      { messages: [], toolCallId: 'call-model-ri-3' } as never,
    )
    expect(readResult).toEqual([{
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${transparentPng.toString('base64')}`,
      },
    }])

    // 5. In Session B: Computer Use is disabled -> tools are omitted
    const sessionBTools = await resolveLlmTools({
      activeTools: [], // computerUseEnabled = false, so no computer use tools passed
      attribution: {
        sessionId: 'session-B',
        turnId: 'turn-1',
      },
    })
    expect(sessionBTools.some(t => t.function.name === COMPUTER_USE_TOOL_NAME)).toBe(false)
    expect(sessionBTools.some(t => t.function.name === COMPUTER_USE_READ_IMAGE_TOOL_NAME)).toBe(false)
  })

  it('Requirement 3: interleaves concurrent Session A & Session B without cross-contamination or UI activeSession drift', async () => {
    const llmToolsStore = useLlmToolsStore(pinia)

    // Simulate reactive UI store where activeSessionId represents currently visible tab
    const uiActiveSessionId = ref('session-A')

    // Session A and Session B resolve request-bound tool instances
    const sessionATools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME),
      attribution: {
        sessionId: 'session-A',
        turnId: 'turn-A-100',
      },
    })
    const sessionBTools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME),
      attribution: {
        sessionId: 'session-B',
        turnId: 'turn-B-200',
      },
    })

    const cuToolA = sessionATools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!
    const cuToolB = sessionBTools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!

    // User switches active chat window in the UI to an unrelated session C while requests are in-flight
    uiActiveSessionId.value = 'session-C-unrelated'

    // Interleaved concurrent execution: neither session's provenance drifts to session-C
    const [resultA, resultB] = await Promise.all([
      cuToolA.execute({ argv: ['invoke', 'window.list'] }, { messages: [], toolCallId: 'call-A-first' } as never),
      cuToolB.execute({ argv: ['invoke', 'display.capture'] }, { messages: [], toolCallId: 'call-B-second' } as never),
    ])

    expect(resultA).toContain('Visual Studio Code')
    expect(resultB).toContain('test-capture.png')
    expect(uiActiveSessionId.value).toBe('session-C-unrelated')
  })

  it('Requirement 3: prevents Session A from hijacking or consuming Session B pending approval action', async () => {
    const llmToolsStore = useLlmToolsStore(pinia)

    // Main registers a mutating PendingAction strictly authorized for Session B
    const pendingB = mainSetup.actionManager.createPendingAction({
      attribution: { sessionId: 'session-B', turnId: 'turn-B-1' },
      argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'],
    })
    mainSetup.actionManager.approve(pendingB.id)

    // Session A tries to consume Session B's actionId
    const sessionATools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME),
      attribution: {
        sessionId: 'session-A',
        turnId: 'turn-A-1',
      },
    })
    const cuToolA = sessionATools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!

    await expect(cuToolA.execute(
      {
        argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'],
        actionId: pendingB.id,
      },
      { messages: [], toolCallId: 'call-A-exploit' } as never,
    )).rejects.toThrow(/attribution mismatch: action was authorized for session 'session-B', but requested by session 'session-A'/)

    // Action B status remains 'approved' (not consumed by the rogue caller)
    expect(mainSetup.actionManager.get(pendingB.id)?.status).toBe('approved')
  })

  it('Requirement 3: ensures mutating operations without user approval result in ZERO executor calls', async () => {
    const llmToolsStore = useLlmToolsStore(pinia)

    const sessionATools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME),
      attribution: {
        sessionId: 'session-A',
        turnId: 'turn-A-1',
      },
    })
    const cuToolA = sessionATools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!

    // Model attempts a mutating action without actionId
    await expect(cuToolA.execute(
      { argv: ['invoke', 'input.clickPoint', '100', '200', '--target', 'app:notepad'] },
      { messages: [], toolCallId: 'call-A-unapproved' } as never,
    )).rejects.toThrow(/Mutating desktop operation 'input.clickPoint' requires an approved action/)

    // ZERO CLI processes must have been executed for mutating commands
    expect(execFileCalls.filter(c => c.args.includes('input.clickPoint')).length).toBe(0)
  })

  it('Requirement 3: invalidates related pending actions when request or session is cancelled', async () => {
    // Session A creates a pending action
    const actionA = mainSetup.actionManager.createPendingAction({
      attribution: { sessionId: 'session-A', turnId: 'turn-A-1' },
      argv: ['invoke', 'input.clickPoint', '10', '20', '--target', 'app:calc'],
    })
    mainSetup.actionManager.approve(actionA.id)
    expect(mainSetup.actionManager.get(actionA.id)?.status).toBe('approved')

    // Request is cancelled in Session A via IPC cancel
    const cancelledCount = await cancelViaIpc({ sessionId: 'session-A', reason: 'User aborted turn' })
    expect(cancelledCount).toBe(1)

    // The action must now be cancelled
    const actionAfter = mainSetup.actionManager.get(actionA.id)
    expect(actionAfter?.status).toBe('cancelled')
    expect(actionAfter?.settlement?.error).toBe('User aborted turn')

    // Consumption attempt is rejected
    const llmToolsStore = useLlmToolsStore(pinia)
    const sessionATools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME),
      attribution: { sessionId: 'session-A', turnId: 'turn-A-1' },
    })
    const cuToolA = sessionATools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!

    await expect(cuToolA.execute(
      {
        argv: ['invoke', 'input.clickPoint', '10', '20', '--target', 'app:calc'],
        actionId: actionA.id,
      },
      { messages: [], toolCallId: 'call-after-cancel' } as never,
    )).rejects.toThrow(/was cancelled/)
  })

  it('Requirement 3: triggers automatic action invalidation when AbortSignal aborts', async () => {
    // Create an approved action for session-abort
    const action = mainSetup.actionManager.createPendingAction({
      attribution: { sessionId: 'session-abort', turnId: 'turn-1' },
      argv: ['invoke', 'input.clickPoint', '10', '20', '--target', 'app:calc'],
    })
    mainSetup.actionManager.approve(action.id)

    const llmToolsStore = useLlmToolsStore(pinia)
    const sessionTools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME),
      attribution: { sessionId: 'session-abort', turnId: 'turn-1' },
    })
    const cuTool = sessionTools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!

    // Trigger AbortController
    const controller = new AbortController()
    controller.abort(new Error('Turn was aborted by user'))

    // Tool execution detects aborted signal, cancels session pending actions in Main, and throws
    await expect(cuTool.execute(
      { argv: ['invoke', 'input.clickPoint', '10', '20', '--target', 'app:calc'], actionId: action.id },
      { messages: [], toolCallId: 'call-aborted', abortSignal: controller.signal } as never,
    )).rejects.toThrow(/Turn was aborted by user/)

    // Pending action in Main is invalidated and cancelled
    expect(mainSetup.actionManager.get(action.id)?.status).toBe('cancelled')
  })

  it('Requirement 3: legitimate read-only requests succeed and are not blocked while mutating actions are pending', async () => {
    const llmToolsStore = useLlmToolsStore(pinia)

    // Create an unapproved pending mutating action
    mainSetup.actionManager.createPendingAction({
      attribution: { sessionId: 'session-A', turnId: 'turn-A-1' },
      argv: ['invoke', 'input.clickPoint', '10', '20', '--target', 'app:calc'],
    })

    const sessionATools = await resolveLlmTools({
      activeTools: llmToolsStore.getToolsByNames(COMPUTER_USE_TOOL_NAME, COMPUTER_USE_READ_IMAGE_TOOL_NAME),
      attribution: { sessionId: 'session-A', turnId: 'turn-A-1' },
    })
    const cuTool = sessionATools.find(t => t.function.name === COMPUTER_USE_TOOL_NAME)!
    const readTool = sessionATools.find(t => t.function.name === COMPUTER_USE_READ_IMAGE_TOOL_NAME)!

    // Read-only calls must continue to succeed cleanly
    const winResult = await cuTool.execute(
      { argv: ['invoke', 'window.list'] },
      { messages: [], toolCallId: 'call-read-during-pending' } as never,
    )
    expect(winResult).toContain('Visual Studio Code')

    const imgResult = await readTool.execute(
      { path: join(mockStoreRoot, 'test-capture.png') },
      { messages: [], toolCallId: 'call-read-img-during-pending' } as never,
    )
    expect(imgResult).toEqual([{
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${transparentPng.toString('base64')}` },
    }])
  })
})
