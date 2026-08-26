import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import {
  createPtySession,
  isPtyAvailable,
  listPtySessions,
  readPtyScreen,
} from '../terminal/pty-runner'
import { createTestConfig } from '../test-fixtures'
import { registerPtyTools } from './register-pty'

vi.mock('../terminal/pty-runner', () => ({
  createPtySession: vi.fn(),
  destroyAllPtySessions: vi.fn(),
  destroyPtySession: vi.fn(),
  getPtyAvailabilityInfo: vi.fn().mockResolvedValue({ available: true }),
  isPtyAvailable: vi.fn(),
  listPtySessions: vi.fn(),
  readPtyScreen: vi.fn(),
  resizePty: vi.fn(),
  writeToPty: vi.fn(),
}))

type ToolHandler = (args: Record<string, unknown>) => Promise<any>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
  }
}

describe('registerPtyTools', () => {
  let runtime: ComputerUseServerRuntime
  let pendingActions: Array<Record<string, unknown>>

  beforeEach(() => {
    pendingActions = []
    runtime = {
      config: createTestConfig({ approvalMode: 'never' }),
      session: {
        createPendingAction: vi.fn((record: Record<string, unknown>) => {
          const pending = { ...record, createdAt: new Date().toISOString(), id: `pending_${pendingActions.length + 1}` }
          pendingActions.push(pending)
          return pending
        }),
        listPendingActions: vi.fn(() => pendingActions),
        record: vi.fn().mockResolvedValue(undefined),
      },
      stateManager: new RunStateManager(),
    } as unknown as ComputerUseServerRuntime
    vi.clearAllMocks()
  })

  it('creates PTY sessions, tracks lifecycle, and binds them to workflow steps', async () => {
    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(createPtySession).mockResolvedValue({
      alive: true,
      cols: 120,
      id: 'pty_1',
      pid: 4242,
      rows: 30,
      screenContent: '',
    })
    const { invoke, server } = createMockServer()

    registerPtyTools({ runtime, server })

    const result = await invoke('pty_create', {
      cols: 120,
      cwd: '/tmp/project',
      rows: 30,
      workflowStepLabel: 'Run TUI check',
    })

    expect(createPtySession).toHaveBeenCalledWith(runtime.config, {
      cols: 120,
      cwd: '/tmp/project',
      rows: 30,
    })
    expect((result.structuredContent as Record<string, any>).status).toBe('ok')
    expect(runtime.stateManager.getState().activePtySessionId).toBe('pty_1')
    expect(runtime.stateManager.getPtySessions()).toEqual([
      expect.objectContaining({
        alive: true,
        boundWorkflowStepLabel: 'Run TUI check',
        cols: 120,
        cwd: '/tmp/project',
        id: 'pty_1',
        pid: 4242,
        rows: 30,
      }),
    ])
  })

  it('reports tracked PTY metadata in pty_get_status', async () => {
    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(listPtySessions).mockReturnValue([
      {
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 9001,
        rows: 24,
        screenContent: '',
      },
    ])
    runtime.stateManager.registerPtySession({
      alive: true,
      cols: 80,
      cwd: '/tmp/project',
      id: 'pty_1',
      pid: 9001,
      rows: 24,
    })
    runtime.stateManager.bindPtySessionToStep('pty_1', 'Inspect terminal')
    runtime.stateManager.touchPtySession('pty_1')
    const { invoke, server } = createMockServer()

    registerPtyTools({ runtime, server })

    const result = await invoke('pty_get_status')
    const structured = result.structuredContent as Record<string, any>

    expect(structured.ptyAvailable).toBe(true)
    expect(structured.sessions).toEqual([
      expect.objectContaining({
        alive: true,
        boundWorkflowStepLabel: 'Inspect terminal',
        cols: 80,
        id: 'pty_1',
        lastInteractionAt: expect.any(String),
        pid: 9001,
        rows: 24,
      }),
    ])
  })

  it('reads screen content from tracked sessions and updates session liveness', async () => {
    runtime.stateManager.registerPtySession({
      alive: true,
      cols: 80,
      cwd: '/tmp/project',
      id: 'pty_1',
      pid: 9001,
      rows: 24,
    })
    vi.mocked(readPtyScreen).mockReturnValue({
      alive: false,
      cols: 80,
      id: 'pty_1',
      pid: 9001,
      rows: 24,
      screenContent: 'htop',
    })
    const { invoke, server } = createMockServer()

    registerPtyTools({ runtime, server })

    const result = await invoke('pty_read_screen', {
      maxLines: 24,
      sessionId: 'pty_1',
    })

    expect(readPtyScreen).toHaveBeenCalledWith('pty_1', { maxLines: 24 })
    expect((result.structuredContent as Record<string, any>).screenContent).toBe('htop')
    expect(runtime.stateManager.getPtySessions()).toEqual([
      expect.objectContaining({
        alive: false,
        id: 'pty_1',
        lastInteractionAt: expect.any(String),
      }),
    ])
  })

  it('returns pagination nudges from pty_read_screen heuristics', async () => {
    runtime.stateManager.registerPtySession({
      alive: true,
      cols: 80,
      cwd: '/tmp/project',
      id: 'pty_1',
      pid: 9001,
      rows: 24,
    })
    vi.mocked(readPtyScreen).mockReturnValue({
      alive: true,
      cols: 80,
      id: 'pty_1',
      pid: 9001,
      rows: 24,
      screenContent: 'line 1\nline 2\n--More--\n',
    })
    const { invoke, server } = createMockServer()

    registerPtyTools({ runtime, server })

    const result = await invoke('pty_read_screen', {
      sessionId: 'pty_1',
    })

    expect((result.structuredContent as Record<string, any>).suggestedInteraction).toBe('press_space')
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: expect.stringContaining('You may need to press Space'),
      }),
    ]))
  })

  it('records observed cwd from the last non-empty prompt line without mutating creation cwd', async () => {
    runtime.stateManager.registerPtySession({
      alive: true,
      cols: 80,
      cwd: '/tmp/project',
      id: 'pty_1',
      pid: 9001,
      rows: 24,
    })
    vi.mocked(readPtyScreen).mockReturnValue({
      alive: true,
      cols: 80,
      id: 'pty_1',
      pid: 9001,
      rows: 24,
      screenContent: 'cd /tmp/next\n\u001B[32malice@wonderland\u001B[0m:\u001B[34m/tmp/next\u001B[0m$ \n',
    })
    const { invoke, server } = createMockServer()

    registerPtyTools({ runtime, server })

    const result = await invoke('pty_read_screen', {
      sessionId: 'pty_1',
    })

    expect((result.structuredContent as Record<string, any>).observedCwd).toBe('/tmp/next')
    expect(runtime.stateManager.getPtySessions()).toEqual([
      expect.objectContaining({
        cwd: '/tmp/project',
        id: 'pty_1',
        observedCwd: '/tmp/next',
      }),
    ])
  })
})
