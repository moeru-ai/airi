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
import { executeApprovedPtyCreate, registerPtyTools } from './register-pty'

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
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
    hasHandler(name: string) {
      return handlers.has(name)
    },
  }
}

describe('register-pty: terminal lane', () => {
  let runtime: ComputerUseServerRuntime
  let pendingActions: Array<Record<string, unknown>>

  beforeEach(() => {
    pendingActions = []
    runtime = {
      config: createTestConfig({ approvalMode: 'never' }),
      stateManager: new RunStateManager(),
      session: {
        createPendingAction: vi.fn((record: Record<string, unknown>) => {
          const pending = { ...record, id: `pending_${pendingActions.length + 1}`, createdAt: new Date().toISOString() }
          pendingActions.push(pending)
          return pending
        }),
        listPendingActions: vi.fn(() => pendingActions),
        record: vi.fn().mockResolvedValue(undefined),
      },
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
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      const result = await invoke('pty_create', {
        rows: 24,
        cols: 80,
        cwd: '/tmp',
        approvalSessionId: 'approval_1',
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
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 1000,
      })
      const result = await executeApprovedPtyCreate(runtime, {
        rows: 24,
        cols: 80,
        approvalSessionId: 'approval_1',
      })

      expect((result.structuredContent as Record<string, any>).approvalSessionId).toBe('approval_1')
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(1)
    })

    it('pty_destroy revokes the Open Grant', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 1000,
      })
      vi.mocked(destroyPtySession).mockReturnValue(true)
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await executeApprovedPtyCreate(runtime, { rows: 24, cols: 80, approvalSessionId: 'approval_1' })
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(1)

      await invoke('pty_destroy', { sessionId: 'pty_1', approvalSessionId: 'approval_1' })
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
        id: 'pty_1',
        alive: true,
        rows: 30,
        cols: 120,
        screenContent: '',
        pid: 2000,
      })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await invoke('pty_create', { rows: 30, cols: 120, cwd: '/home/user' })

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
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 3000,
      })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await invoke('pty_create', { rows: 24, cols: 80 })

      // Write a long string (> 80 chars)
      const longInput = 'a'.repeat(200)
      await invoke('pty_send_input', { sessionId: 'pty_1', data: longInput })

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
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 3000,
      })
      vi.mocked(readPtyScreen).mockReturnValue({
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: 'line1\nline2\nline3',
        pid: 3000,
      })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await invoke('pty_create', { rows: 24, cols: 80 })
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
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 3000,
      })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await invoke('pty_create', { rows: 24, cols: 80 })
      await invoke('pty_resize', { sessionId: 'pty_1', rows: 40, cols: 160 })

      const resizeAudit = runtime.stateManager.getPtyAuditForSession('pty_1')
        .filter(e => e.event === 'resize')
      expect(resizeAudit).toHaveLength(1)
      expect(resizeAudit[0].rows).toBe(40)
      expect(resizeAudit[0].cols).toBe(160)
    })

    it('pty_destroy logs actor + outcome', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 3000,
      })
      vi.mocked(destroyPtySession).mockReturnValue(true)
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await invoke('pty_create', { rows: 24, cols: 80 })
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
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 4000,
      })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await invoke('pty_create', { stepId: 'step_abc', rows: 24, cols: 80 })

      const sessions = runtime.stateManager.getPtySessions()
      expect(sessions[0].boundStepId).toBe('step_abc')
    })

    it('pty_get_status includes boundStepId in response', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(listPtySessions).mockReturnValue([
        { id: 'pty_1', alive: true, rows: 24, cols: 80, screenContent: '', pid: 5000 },
      ])
      runtime.stateManager.registerPtySession({
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        pid: 5000,
      })
      runtime.stateManager.bindPtySessionToStepId('pty_1', 'step_xyz')

      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

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
      const { server, hasHandler } = createMockServer()
      registerPtyTools({ server, runtime })

      expect(hasHandler('pty_send_input')).toBe(true)
      expect(hasHandler('pty_write')).toBe(true)
    })

    it('pty_write works identically to pty_send_input', async () => {
      vi.mocked(isPtyAvailable).mockResolvedValue(true)
      vi.mocked(createPtySession).mockResolvedValue({
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 6000,
      })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      await invoke('pty_create', { rows: 24, cols: 80 })
      const result = await invoke('pty_write', { sessionId: 'pty_1', data: 'ls\r' })

      expect(writeToPty).toHaveBeenCalledWith('pty_1', { data: 'ls\r' })
      expect((result.structuredContent as Record<string, any>).status).toBe('ok')
    })

    it('pty_write reports its own operation name in grant errors', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      const result = await invoke('pty_write', {
        sessionId: 'pty_missing',
        data: 'ls\r',
        approvalSessionId: 'approval_1',
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
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '',
        pid: 7000,
      })
      vi.mocked(readPtyScreen).mockReturnValue({
        id: 'pty_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: '$ ls\nfile.txt',
        pid: 7000,
      })
      vi.mocked(destroyPtySession).mockReturnValue(true)
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      // Create
      const createResult = await executeApprovedPtyCreate(runtime, {
        rows: 24,
        cols: 80,
        cwd: '/tmp',
        stepId: 'step_life',
        approvalSessionId: 'approval_1',
      })
      expect((createResult.structuredContent as Record<string, any>).status).toBe('ok')
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(1)

      // Send input
      await invoke('pty_send_input', { sessionId: 'pty_1', data: 'ls\r', approvalSessionId: 'approval_1' })
      expect(writeToPty).toHaveBeenCalledWith('pty_1', { data: 'ls\r' })

      // Read screen
      const readResult = await invoke('pty_read_screen', { sessionId: 'pty_1', approvalSessionId: 'approval_1' })
      expect((readResult.structuredContent as Record<string, any>).screenContent).toBe('$ ls\nfile.txt')

      // Resize
      await invoke('pty_resize', { sessionId: 'pty_1', rows: 48, cols: 160, approvalSessionId: 'approval_1' })
      expect(resizePty).toHaveBeenCalledWith('pty_1', { cols: 160, rows: 48 })

      // Destroy
      await invoke('pty_destroy', { sessionId: 'pty_1', approvalSessionId: 'approval_1' })
      expect(runtime.stateManager.getActivePtyGrants()).toHaveLength(0)
      expect(runtime.stateManager.getPtySessions()).toHaveLength(0)

      // Audit log has all 5 events
      const auditLog = runtime.stateManager.getPtyAuditLog()
      const events = auditLog.map(e => e.event)
      expect(events).toEqual(['create', 'send_input', 'read_screen', 'resize', 'destroy'])
    })

    it('rejects PTY operations without an active grant when approvals are enabled', async () => {
      runtime.config = createTestConfig({ approvalMode: 'actions' })
      const { server, invoke } = createMockServer()
      registerPtyTools({ server, runtime })

      const sendResult = await invoke('pty_send_input', {
        sessionId: 'pty_missing',
        data: 'ls\r',
        approvalSessionId: 'approval_1',
      })

      expect(sendResult.isError).toBe(true)
      expect((sendResult.structuredContent as Record<string, any>).status).toBe('pty_grant_required')
    })
  })
})
