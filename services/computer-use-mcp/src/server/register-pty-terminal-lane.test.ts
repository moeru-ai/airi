/**
 * Terminal Lane v1 — PTY tool registration tests.
 *
 * Tests the terminal lane behavior of register-pty tools:
 * - Open Grant lifecycle: create issues grant, destroy revokes
 * - Audit logging: every operation logged, send_input only byte count + preview
 * - stepId binding: pty_create binds to stepId
 * - pty_send_input primary name + pty_write compat alias
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import {
  createPtySession,
  destroyPtySession,
  isPtyAvailable,
  listPtySessions,
  readPtyScreen,
  resizePty,
  writeToPty,
} from '../terminal/pty-runner'
import { createTestConfig } from '../test-fixtures'
import { createAcquirePtyCallback, executeApprovedPtyCreate, registerPtyTools } from './register-pty'

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
    hasHandler(name: string) {
      return handlers.has(name)
    },
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

describe('register-pty: terminal lane', () => {
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

  // -----------------------------------------------------------------------
  // Open Grant lifecycle
  // -----------------------------------------------------------------------

  describe('open grant lifecycle', () => {
    it('pty_create returns approval_required when approvals are enabled', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      const result = await invoke('pty_create', {
        approvalSessionId: 'approval_1',
        cols: 80,
        cwd: '/tmp',
        rows: 24,
      })
      const structured = result.structuredContent as Record<string, any>

      expect(structured.status).toBe('approval_required')
      expect((runtime.session.createPendingAction as any)).toHaveBeenCalledTimes(1)
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(0)
    })

    it('approved PTY create issues an Open Grant', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 1000,
        rows: 24,
        screenContent: '',
      })
      const result = await executeApprovedPtyCreate(runtime, {
        approvalSessionId: 'approval_1',
        cols: 80,
        rows: 24,
      })

      expect((result.structuredContent as Record<string, any>).approvalSessionId).toBe('approval_1')
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(1)
    })

    it('workflow PTY self-acquire queues approval with a grant session id', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      const acquirePty = createAcquirePtyCallback(runtime)

      const result = await acquirePty({
        autoApprove: false,
        cols: 80,
        cwd: '/tmp/project',
        rows: 24,
        stepId: 'step_terminal_lane',
        taskId: 'task_terminal_lane',
      })

      expect(result).toMatchObject({
        acquired: false,
        approvalPending: true,
      })
      expect(pendingActions).toHaveLength(1)
      expect(pendingActions[0]).toMatchObject({
        action: {
          input: expect.objectContaining({
            approvalSessionId: expect.any(String),
            cwd: '/tmp/project',
            stepId: 'step_terminal_lane',
          }),
          kind: 'pty_create',
        },
        toolName: 'pty_create',
      })
    })

    it('pty_destroy revokes the Open Grant', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 1000,
        rows: 24,
        screenContent: '',
      })
      vi.mocked(destroyPtySession).mockReturnValue(true)
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await executeApprovedPtyCreate(runtime, { approvalSessionId: 'approval_1', cols: 80, rows: 24 })
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(1)

      await invoke('pty_destroy', { approvalSessionId: 'approval_1', sessionId: 'pty_1' })
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // Audit logging
  // -----------------------------------------------------------------------

  describe('audit logging', () => {
    it('pty_create writes a create audit entry', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 120,
        id: 'pty_1',
        pid: 2000,
        rows: 30,
        screenContent: '',
      })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await invoke('pty_create', { cols: 120, cwd: '/home/user', rows: 30 })

      const log = runtime.stateManager.getPtyAuditForSession('pty_1')
      expect(log).toHaveLength(1)
      expect(log[0].event).toBe('create')
      expect(log[0].cwd).toBe('/home/user')
      expect(log[0].rows).toBe(30)
      expect(log[0].cols).toBe(120)
      expect(log[0].pid).toBe(2000)
    })

    it('pty_send_input logs byte count + truncated preview only', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 3000,
        rows: 24,
        screenContent: '',
      })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await invoke('pty_create', { cols: 80, rows: 24 })

      // Write a long string (> 80 chars)
      const longInput = 'a'.repeat(200)
      await invoke('pty_send_input', { data: longInput, sessionId: 'pty_1' })

      const inputAudit = runtime.stateManager.getPtyAuditForSession('pty_1')
        .filter(e => e.event === 'send_input')
      expect(inputAudit).toHaveLength(1)
      expect(inputAudit[0].byteCount).toBe(200)
      // Preview truncated to 80 chars + ellipsis
      expect(inputAudit[0].inputPreview!.length).toBeLessThanOrEqual(81)
    })

    it('pty_read_screen logs line count + alive state', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 3000,
        rows: 24,
        screenContent: '',
      })
      vi.mocked(readPtyScreen).mockReturnValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 3000,
        rows: 24,
        screenContent: 'line1\nline2\nline3',
      })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await invoke('pty_create', { cols: 80, rows: 24 })
      await invoke('pty_read_screen', { sessionId: 'pty_1' })

      const readAudit = runtime.stateManager.getPtyAuditForSession('pty_1')
        .filter(e => e.event === 'read_screen')
      expect(readAudit).toHaveLength(1)
      expect(readAudit[0].returnedLineCount).toBe(3)
      expect(readAudit[0].alive).toBe(true)
    })

    it('pty_resize logs dimensions', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 3000,
        rows: 24,
        screenContent: '',
      })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await invoke('pty_create', { cols: 80, rows: 24 })
      await invoke('pty_resize', { cols: 160, rows: 40, sessionId: 'pty_1' })

      const resizeAudit = runtime.stateManager.getPtyAuditForSession('pty_1')
        .filter(e => e.event === 'resize')
      expect(resizeAudit).toHaveLength(1)
      expect(resizeAudit[0].rows).toBe(40)
      expect(resizeAudit[0].cols).toBe(160)
    })

    it('pty_destroy logs actor + outcome', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 3000,
        rows: 24,
        screenContent: '',
      })
      vi.mocked(destroyPtySession).mockReturnValue(true)
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await invoke('pty_create', { cols: 80, rows: 24 })
      await invoke('pty_destroy', { sessionId: 'pty_1' })

      const destroyAudit = runtime.stateManager.getPtyAuditLog()
        .filter(e => e.event === 'destroy')
      expect(destroyAudit).toHaveLength(1)
      expect(destroyAudit[0].actor).toBe('tool_call')
      expect(destroyAudit[0].outcome).toBe('ok')
    })
  })

  // -----------------------------------------------------------------------
  // stepId binding
  // -----------------------------------------------------------------------

  describe('stepId binding', () => {
    it('pty_create binds session to stepId when provided', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 4000,
        rows: 24,
        screenContent: '',
      })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await invoke('pty_create', { cols: 80, rows: 24, stepId: 'step_abc' })

      const sessions = runtime.stateManager.getPtySessions()
      expect(sessions[0].boundStepId).toBe('step_abc')
    })

    it('pty_get_status includes boundStepId in response', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(listPtySessions).mockReturnValue([
        { alive: true, cols: 80, id: 'pty_1', pid: 5000, rows: 24, screenContent: '' },
      ])
      runtime.stateManager.registerPtySession({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 5000,
        rows: 24,
      })
      runtime.stateManager.bindPtySessionToStepId('pty_1', 'step_xyz')

      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      const result = await invoke('pty_get_status')
      const sessions = (result.structuredContent as Record<string, any>).sessions
      expect(sessions[0].boundStepId).toBe('step_xyz')
    })
  })

  // -----------------------------------------------------------------------
  // pty_send_input + pty_write compat alias
  // -----------------------------------------------------------------------

  describe('pty_send_input / pty_write alias', () => {
    it('registers both pty_send_input and pty_write', () => {
      const { hasHandler, server } = createMockServer()
      registerPtyTools({ runtime, server })

      expect(hasHandler('pty_send_input')).toBe(true)
      expect(hasHandler('pty_write')).toBe(true)
    })

    it('pty_write works identically to pty_send_input', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 6000,
        rows: 24,
        screenContent: '',
      })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      await invoke('pty_create', { cols: 80, rows: 24 })
      const result = await invoke('pty_write', { data: 'ls\r', sessionId: 'pty_1' })

      expect(writeToPty).toHaveBeenCalledWith('pty_1', { data: 'ls\r' })
      expect((result.structuredContent as Record<string, any>).status).toBe('ok')
    })

    it('pty_write reports its own operation name in grant errors', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      const result = await invoke('pty_write', {
        approvalSessionId: 'approval_1',
        data: 'ls\r',
        sessionId: 'pty_missing',
      })

      expect(result.isError).toBe(true)
      expect((result.structuredContent as Record<string, any>).operation).toBe('pty_write')
    })
  })

  // -----------------------------------------------------------------------
  // Full lifecycle: create → send_input → read → resize → destroy
  // -----------------------------------------------------------------------

  describe('full PTY lifecycle', () => {
    it('create → send_input → read → resize → destroy', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 7000,
        rows: 24,
        screenContent: '',
      })
      vi.mocked(readPtyScreen).mockReturnValue({
        alive: true,
        cols: 80,
        id: 'pty_1',
        pid: 7000,
        rows: 24,
        screenContent: '$ ls\nfile.txt',
      })
      vi.mocked(destroyPtySession).mockReturnValue(true)
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      // Create
      const createResult = await executeApprovedPtyCreate(runtime, {
        approvalSessionId: 'approval_1',
        cols: 80,
        cwd: '/tmp',
        rows: 24,
        stepId: 'step_life',
      })
      expect((createResult.structuredContent as Record<string, any>).status).toBe('ok')
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(1)

      // Send input
      await invoke('pty_send_input', { approvalSessionId: 'approval_1', data: 'ls\r', sessionId: 'pty_1' })
      expect(writeToPty).toHaveBeenCalledWith('pty_1', { data: 'ls\r' })

      // Read screen
      const readResult = await invoke('pty_read_screen', { approvalSessionId: 'approval_1', sessionId: 'pty_1' })
      expect((readResult.structuredContent as Record<string, any>).screenContent).toBe('$ ls\nfile.txt')

      // Resize
      await invoke('pty_resize', { approvalSessionId: 'approval_1', cols: 160, rows: 48, sessionId: 'pty_1' })
      expect(resizePty).toHaveBeenCalledWith('pty_1', { cols: 160, rows: 48 })

      // Destroy
      await invoke('pty_destroy', { approvalSessionId: 'approval_1', sessionId: 'pty_1' })
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(0)
      expect(runtime.stateManager.getPtySessions()).toHaveLength(0)

      // Audit log has all 5 events
      const auditLog = runtime.stateManager.getPtyAuditLog()
      const events = auditLog.map(e => e.event)
      expect(events).toEqual(['create', 'send_input', 'read_screen', 'resize', 'destroy'])
    })

    it('rejects PTY operations without an active grant when approvals are enabled', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      const { invoke, server } = createMockServer()
      registerPtyTools({ runtime, server })

      const sendResult = await invoke('pty_send_input', {
        approvalSessionId: 'approval_1',
        data: 'ls\r',
        sessionId: 'pty_missing',
      })

      expect(sendResult.isError).toBe(true)
      expect((sendResult.structuredContent as Record<string, any>).status).toBe('pty_grant_required')
    })
  })
})
