import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type {
  ForegroundContext,
  PolicyDecision,
  PtyCreateApprovalInput,
} from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import process from 'node:process'

import { z } from 'zod'

import {
  createPtySession,
  destroyAllPtySessions,
  destroyPtySession,
  getPtyAvailabilityInfo,
  listPtySessions,
  readPtyScreen,
  resizePty,
  writeToPty,
} from '../terminal/pty-runner'
import { textContent } from './content'
import { buildApprovalResponse } from './responses'

export interface RegisterPtyToolsOptions {
  server: McpServer
  runtime: ComputerUseServerRuntime
}

/**
 * Truncate to a safe audit preview — never log full sensitive input.
 * Returns at most `maxLen` characters followed by ellipsis if truncated.
 */
function auditPreview(data: string, maxLen = 80): string {
  if (data.length <= maxLen)
    return data
  return `${data.slice(0, maxLen)}…`
}

function requiresPtyApproval(runtime: ComputerUseServerRuntime) {
  return runtime.config.approvalMode !== 'never'
}

function getApprovalContext(runtime: ComputerUseServerRuntime): ForegroundContext {
  return runtime.stateManager.getState().foregroundContext
    ?? { available: false, platform: process.platform as NodeJS.Platform }
}

function buildPtyApprovalDecision(): PolicyDecision {
  return {
    allowed: true,
    requiresApproval: true,
    reason: 'Creating an interactive PTY session requires approval.',
    reasons: ['Creating an interactive PTY session requires approval.'],
    riskLevel: 'high',
    estimatedOperationUnits: 4,
  }
}

function buildApprovalSessionRequiredResponse(operation: string): CallToolResult {
  return {
    isError: true,
    content: [
      textContent(`${operation} requires an approval session id when approvals are enabled.`),
    ],
    structuredContent: {
      status: 'approval_session_required',
      operation,
    },
  }
}

function buildPtyGrantRequiredResponse(operation: string, sessionId: string): CallToolResult {
  return {
    isError: true,
    content: [
      textContent(`${operation} requires an active PTY Open Grant for session ${sessionId}. Create or approve the PTY session first.`),
    ],
    structuredContent: {
      status: 'pty_grant_required',
      operation,
      sessionId,
    },
  }
}

function requirePtyGrant(params: {
  runtime: ComputerUseServerRuntime
  operation: string
  sessionId: string
  approvalSessionId?: string
}): CallToolResult | undefined {
  if (!requiresPtyApproval(params.runtime))
    return undefined

  if (!params.approvalSessionId) {
    return buildApprovalSessionRequiredResponse(params.operation)
  }

  if (!params.runtime.stateManager.hasPtyApprovalGrant(params.approvalSessionId, params.sessionId)) {
    return buildPtyGrantRequiredResponse(params.operation, params.sessionId)
  }

  return undefined
}

export async function executeApprovedPtyCreate(
  runtime: ComputerUseServerRuntime,
  {
    rows,
    cols,
    cwd,
    stepId,
    workflowStepLabel,
    approvalSessionId,
  }: PtyCreateApprovalInput,
): Promise<CallToolResult> {
  const availability = await getPtyAvailabilityInfo()
  if (!availability.available) {
    return {
      isError: true,
      content: [textContent(`PTY support unavailable: ${availability.error || 'node-pty could not be loaded.'}`)],
      structuredContent: {
        status: 'unavailable',
        ...(availability.error ? { error: availability.error } : {}),
      },
    }
  }

  try {
    const session = await createPtySession(runtime.config, { rows, cols, cwd })

    runtime.stateManager.registerPtySession({
      id: session.id,
      alive: session.alive,
      rows: session.rows,
      cols: session.cols,
      pid: session.pid,
      cwd,
    })
    if (stepId) {
      runtime.stateManager.bindPtySessionToStepId(session.id, stepId)
    }
    if (workflowStepLabel) {
      runtime.stateManager.bindPtySessionToStep(session.id, workflowStepLabel)
    }

    if (requiresPtyApproval(runtime) && approvalSessionId) {
      runtime.stateManager.grantPtyApproval(approvalSessionId, session.id)
    }

    const task = runtime.stateManager.getState().activeTask
    const currentStep = task?.steps[task.currentStepIndex]
    runtime.stateManager.appendPtyAudit({
      taskId: task?.id,
      stepId: currentStep?.stepId,
      ptySessionId: session.id,
      event: 'create',
      cwd,
      rows: session.rows,
      cols: session.cols,
      pid: session.pid,
    })

    return {
      content: [
        textContent(`PTY session created: ${session.id} (${session.cols}x${session.rows}, pid ${session.pid}).`),
      ],
      structuredContent: {
        status: 'ok',
        session: {
          id: session.id,
          pid: session.pid,
          rows: session.rows,
          cols: session.cols,
          alive: session.alive,
          stepId,
          workflowStepLabel,
        },
        ...(requiresPtyApproval(runtime) && approvalSessionId
          ? {
              grantScope: 'pty_session',
              approvalSessionId,
            }
          : {}),
      },
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await runtime.session.record({
      event: 'failed',
      toolName: 'pty_create',
      action: {
        kind: 'pty_create',
        input: {
          rows,
          cols,
          cwd,
          stepId,
          workflowStepLabel,
          approvalSessionId,
        },
      },
      context: getApprovalContext(runtime),
      policy: buildPtyApprovalDecision(),
      result: { error: message },
    })

    return {
      isError: true,
      content: [textContent(`PTY create failed: ${message}`)],
      structuredContent: {
        status: 'error',
        error: message,
      },
    }
  }
}

export function registerPtyTools({ server, runtime }: RegisterPtyToolsOptions) {
  // Helper: resolve current task/step ids for audit
  function currentIds(): { taskId?: string, stepId?: string } {
    const task = runtime.stateManager.getState().activeTask
    if (!task)
      return {}
    const step = task.steps[task.currentStepIndex]
    return { taskId: task.id, stepId: step?.stepId }
  }

  server.tool(
    'pty_get_status',
    {},
    async () => {
      const availability = await getPtyAvailabilityInfo()
      const sessions = availability.available ? listPtySessions() : []
      const trackedSessions = runtime.stateManager.getPtySessions()

      return {
        content: [
          textContent(`PTY support: ${availability.available ? 'available' : `unavailable (${availability.error || 'node-pty could not be loaded'})`}. Active sessions: ${sessions.length}.`),
        ],
        structuredContent: {
          status: 'ok',
          ptyAvailable: availability.available,
          ...(availability.error ? { error: availability.error } : {}),
          sessions: sessions.map(s => ({
            id: s.id,
            alive: s.alive,
            pid: s.pid,
            rows: s.rows,
            cols: s.cols,
            boundStepId: trackedSessions.find(entry => entry.id === s.id)?.boundStepId,
            boundWorkflowStepLabel: trackedSessions.find(entry => entry.id === s.id)?.boundWorkflowStepLabel,
            lastInteractionAt: trackedSessions.find(entry => entry.id === s.id)?.lastInteractionAt,
          })),
        },
      }
    },
  )

  server.tool(
    'pty_create',
    {
      rows: z.number().int().min(1).max(200).optional().describe('Terminal rows (default: 24)'),
      cols: z.number().int().min(1).max(500).optional().describe('Terminal columns (default: 80)'),
      cwd: z.string().optional().describe('Initial working directory'),
      stepId: z.string().min(1).optional().describe('Stable workflow step id to bind this PTY session to'),
      workflowStepLabel: z.string().min(1).optional().describe('(deprecated) Workflow step label for backward compat'),
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to bind the PTY Open Grant'),
    },
    async ({ rows, cols, cwd, stepId, workflowStepLabel, approvalSessionId }) => {
      const availability = await getPtyAvailabilityInfo()
      if (!availability.available) {
        return {
          isError: true,
          content: [textContent(`PTY support unavailable: ${availability.error || 'node-pty could not be loaded.'}`)],
          structuredContent: {
            status: 'unavailable',
            ...(availability.error ? { error: availability.error } : {}),
          },
        }
      }

      if (requiresPtyApproval(runtime)) {
        if (!approvalSessionId) {
          return buildApprovalSessionRequiredResponse('pty_create')
        }

        const decision = buildPtyApprovalDecision()
        const context = getApprovalContext(runtime)
        const pending = runtime.session.createPendingAction({
          toolName: 'pty_create',
          action: {
            kind: 'pty_create',
            input: {
              rows,
              cols,
              cwd,
              stepId,
              workflowStepLabel,
              approvalSessionId,
            },
          },
          policy: decision,
          context,
        })
        runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

        await runtime.session.record({
          event: 'approval_required',
          toolName: 'pty_create',
          action: pending.action,
          context,
          policy: decision,
          result: {
            pendingActionId: pending.id,
          },
        })

        return buildApprovalResponse(pending, decision, context, {
          intent: 'Create an interactive PTY session',
          approvalReason: 'PTY session creation opens an interactive terminal surface and should be explicitly approved once per session.',
        })
      }

      return executeApprovedPtyCreate(runtime, {
        rows,
        cols,
        cwd,
        stepId,
        workflowStepLabel,
        approvalSessionId,
      })
    },
  )

  const createSendInputHandler = (toolName: 'pty_send_input' | 'pty_write') => async ({ sessionId, data, approvalSessionId }: { sessionId: string, data: string, approvalSessionId?: string }) => {
    const grantError = requirePtyGrant({
      runtime,
      operation: toolName,
      sessionId,
      approvalSessionId,
    })
    if (grantError) {
      return grantError
    }

    try {
      writeToPty(sessionId, { data })
      runtime.stateManager.touchPtySession(sessionId)

      // Audit: only log byte count + truncated preview, never full content
      const ids = currentIds()
      runtime.stateManager.appendPtyAudit({
        ...ids,
        ptySessionId: sessionId,
        event: 'send_input',
        byteCount: data.length,
        inputPreview: auditPreview(data),
      })

      return {
        content: [textContent(`Wrote ${data.length} byte(s) to ${sessionId}.`)],
        structuredContent: {
          status: 'ok',
          sessionId,
          bytesWritten: data.length,
        },
      }
    }
    catch (error) {
      return {
        isError: true,
        content: [textContent(`PTY send_input failed: ${error instanceof Error ? error.message : String(error)}`)],
        structuredContent: {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  const sendInputSchema = {
    sessionId: z.string().min(1).describe('PTY session id from pty_create'),
    data: z.string().describe('Data to write to the PTY (keystrokes, commands, etc.). Use \\r for Enter, \\x03 for Ctrl+C.'),
    approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
  }

  // Primary name
  server.tool('pty_send_input', sendInputSchema, createSendInputHandler('pty_send_input'))
  // Compat alias — kept for backward compatibility, not the canonical name
  server.tool('pty_write', sendInputSchema, createSendInputHandler('pty_write'))

  server.tool(
    'pty_read_screen',
    {
      sessionId: z.string().min(1).describe('PTY session id'),
      maxLines: z.number().int().min(1).max(500).optional().describe('Maximum lines to return from the terminal buffer (default: terminal rows)'),
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
    },
    async ({ sessionId, maxLines, approvalSessionId }) => {
      const grantError = requirePtyGrant({
        runtime,
        operation: 'pty_read_screen',
        sessionId,
        approvalSessionId,
      })
      if (grantError) {
        return grantError
      }

      try {
        const session = readPtyScreen(sessionId, { maxLines })
        runtime.stateManager.touchPtySession(sessionId)
        runtime.stateManager.updatePtySessionAlive(sessionId, session.alive)

        // Audit
        const ids = currentIds()
        const lineCount = session.screenContent ? session.screenContent.split('\n').length : 0
        runtime.stateManager.appendPtyAudit({
          ...ids,
          ptySessionId: sessionId,
          event: 'read_screen',
          returnedLineCount: lineCount,
          alive: session.alive,
        })

        return {
          content: [textContent(session.screenContent || '(empty)')],
          structuredContent: {
            status: 'ok',
            session: {
              id: session.id,
              alive: session.alive,
              pid: session.pid,
              rows: session.rows,
              cols: session.cols,
            },
            sessionId: session.id,
            alive: session.alive,
            rows: session.rows,
            cols: session.cols,
            screenContent: session.screenContent,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [textContent(`PTY read failed: ${error instanceof Error ? error.message : String(error)}`)],
          structuredContent: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  )

  server.tool(
    'pty_resize',
    {
      sessionId: z.string().min(1).describe('PTY session id'),
      cols: z.number().int().min(1).max(500).describe('New terminal column count'),
      rows: z.number().int().min(1).max(200).describe('New terminal row count'),
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
    },
    async ({ sessionId, cols, rows, approvalSessionId }) => {
      const grantError = requirePtyGrant({
        runtime,
        operation: 'pty_resize',
        sessionId,
        approvalSessionId,
      })
      if (grantError) {
        return grantError
      }

      try {
        resizePty(sessionId, { cols, rows })

        // Audit
        const ids = currentIds()
        runtime.stateManager.appendPtyAudit({
          ...ids,
          ptySessionId: sessionId,
          event: 'resize',
          rows,
          cols,
        })

        return {
          content: [textContent(`Resized ${sessionId} to ${cols}x${rows}.`)],
          structuredContent: {
            status: 'ok',
            sessionId,
            cols,
            rows,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [textContent(`PTY resize failed: ${error instanceof Error ? error.message : String(error)}`)],
          structuredContent: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  )

  server.tool(
    'pty_destroy',
    {
      sessionId: z.string().min(1).describe('PTY session id to destroy'),
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
    },
    async ({ sessionId, approvalSessionId }) => {
      const grantError = requirePtyGrant({
        runtime,
        operation: 'pty_destroy',
        sessionId,
        approvalSessionId,
      })
      if (grantError) {
        return grantError
      }

      const destroyed = destroyPtySession(sessionId)
      if (destroyed) {
        // Revoke the Open Grant for this session
        runtime.stateManager.revokePtyApproval(sessionId)
        runtime.stateManager.unregisterPtySession(sessionId)

        // Audit
        const ids = currentIds()
        runtime.stateManager.appendPtyAudit({
          ...ids,
          ptySessionId: sessionId,
          event: 'destroy',
          actor: 'tool_call',
          outcome: 'ok',
        })
      }

      return {
        content: [textContent(destroyed ? `Destroyed ${sessionId}.` : `Session not found: ${sessionId}.`)],
        structuredContent: {
          status: destroyed ? 'ok' : 'not_found',
          sessionId,
        },
      }
    },
  )
}

// ---------------------------------------------------------------------------
// Workflow self-acquire PTY callback factory
// ---------------------------------------------------------------------------

/**
 * Creates an `AcquirePtyForStep` callback that the workflow engine invokes
 * when surface resolution determines a step needs a PTY.
 *
 * The callback goes through the **same** approval / grant / audit pipeline
 * as the external `pty_create` MCP tool — no shortcuts.
 *
 * When `autoApprove` is true the engine is allowed to create the PTY
 * directly (mirroring `approvalMode === 'never'`). When false and
 * approvals are required, the callback returns `approvalPending: true` so
 * the engine can suspend at `before_pty_acquire`.
 */
export function createAcquirePtyCallback(
  runtime: ComputerUseServerRuntime,
): import('../workflows/engine').AcquirePtyForStep {
  return async ({ taskId, stepId, cwd, rows, cols, autoApprove }) => {
    const availability = await getPtyAvailabilityInfo()
    if (!availability.available) {
      return {
        acquired: false,
        error: `PTY support unavailable: ${availability.error || 'node-pty could not be loaded.'}`,
      }
    }

    // When approvals are active AND the caller did not opt into auto-approve,
    // we must go through the pending-action → user-approval flow.
    if (requiresPtyApproval(runtime) && !autoApprove) {
      const { randomUUID } = await import('node:crypto')
      const approvalSessionId = randomUUID()
      const decision = buildPtyApprovalDecision()
      const context = getApprovalContext(runtime)

      runtime.session.createPendingAction({
        toolName: 'pty_create',
        action: {
          kind: 'pty_create',
          input: { rows, cols, cwd, stepId, approvalSessionId } satisfies PtyCreateApprovalInput,
        },
        policy: decision,
        context,
      })
      runtime.stateManager.setPendingApprovalCount(
        runtime.session.listPendingActions().length,
      )

      await runtime.session.record({
        event: 'approval_required',
        toolName: 'pty_create',
        action: {
          kind: 'pty_create',
          input: { rows, cols, cwd, stepId },
        },
        context,
        policy: decision,
        result: { workflow_self_acquire: true, taskId },
      })

      return { acquired: false, approvalPending: true }
    }

    // Auto-approve path (or approval mode is "never") — create directly.
    // Generate an approvalSessionId so the grant machinery stays consistent.
    const { randomUUID } = await import('node:crypto')
    const approvalSessionId = randomUUID()

    const result = await executeApprovedPtyCreate(runtime, {
      rows,
      cols,
      cwd,
      stepId,
      approvalSessionId,
    })

    if (result.isError) {
      const msg = result.content?.[0] && 'text' in result.content[0]
        ? result.content[0].text
        : 'PTY creation failed'
      return { acquired: false, error: msg }
    }

    const structured = result.structuredContent as Record<string, unknown> | undefined
    const session = structured?.session as Record<string, unknown> | undefined
    const ptySessionId = (session?.id ?? '') as string

    if (!ptySessionId) {
      return { acquired: false, error: 'PTY created but session id missing from result.' }
    }

    return { acquired: true, ptySessionId }
  }
}

/**
 * Cleanup helper — destroy all PTY sessions. Called on server shutdown.
 */
export { destroyAllPtySessions }
