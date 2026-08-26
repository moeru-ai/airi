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
import { errorMessageFromValue } from '../utils/error-message'
import { textContent } from './content'
import { buildApprovalResponse } from './responses'
import { detectPagination, extractCwdFromPrompt } from './terminal-heuristics'

export interface RegisterPtyToolsOptions {
  runtime: ComputerUseServerRuntime
  server: McpServer
}

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
  return async ({ autoApprove, cols, cwd, rows, stepId, taskId }) => {
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
        action: {
          input: { approvalSessionId, cols, cwd, rows, stepId } satisfies PtyCreateApprovalInput,
          kind: 'pty_create',
        },
        context,
        policy: decision,
        toolName: 'pty_create',
      })
      runtime.stateManager.setPendingApprovalCount(
        runtime.session.listPendingActions().length,
      )

      await runtime.session.record({
        action: {
          input: { cols, cwd, rows, stepId },
          kind: 'pty_create',
        },
        context,
        event: 'approval_required',
        policy: decision,
        result: { taskId, workflow_self_acquire: true },
        toolName: 'pty_create',
      })

      return { acquired: false, approvalPending: true }
    }

    // Auto-approve path (or approval mode is "never") — create directly.
    // Generate an approvalSessionId so the grant machinery stays consistent.
    const { randomUUID } = await import('node:crypto')
    const approvalSessionId = randomUUID()

    const result = await executeApprovedPtyCreate(runtime, {
      approvalSessionId,
      cols,
      cwd,
      rows,
      stepId,
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

export async function executeApprovedPtyCreate(
  runtime: ComputerUseServerRuntime,
  {
    approvalSessionId,
    cols,
    cwd,
    rows,
    stepId,
    workflowStepLabel,
  }: PtyCreateApprovalInput,
): Promise<CallToolResult> {
  const availability = await getPtyAvailabilityInfo()
  if (!availability.available) {
    return {
      content: [textContent(`PTY support unavailable: ${availability.error || 'node-pty could not be loaded.'}`)],
      isError: true,
      structuredContent: {
        status: 'unavailable',
        ...(availability.error ? { error: availability.error } : {}),
      },
    }
  }

  try {
    const session = await createPtySession(runtime.config, { cols, cwd, rows })

    runtime.stateManager.registerPtySession({
      alive: session.alive,
      cols: session.cols,
      cwd,
      id: session.id,
      pid: session.pid,
      rows: session.rows,
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
      cols: session.cols,
      cwd,
      event: 'create',
      pid: session.pid,
      ptySessionId: session.id,
      rows: session.rows,
      stepId: currentStep?.stepId,
      taskId: task?.id,
    })

    return {
      content: [
        textContent(`PTY session created: ${session.id} (${session.cols}x${session.rows}, pid ${session.pid}).`),
      ],
      structuredContent: {
        session: {
          alive: session.alive,
          cols: session.cols,
          id: session.id,
          pid: session.pid,
          rows: session.rows,
          stepId,
          workflowStepLabel,
        },
        status: 'ok',
        ...(requiresPtyApproval(runtime) && approvalSessionId
          ? {
              approvalSessionId,
              grantScope: 'pty_session',
            }
          : {}),
      },
    }
  }
  catch (error) {
    const message = errorMessageFromValue(error)

    await runtime.session.record({
      action: {
        input: {
          approvalSessionId,
          cols,
          cwd,
          rows,
          stepId,
          workflowStepLabel,
        },
        kind: 'pty_create',
      },
      context: getApprovalContext(runtime),
      event: 'failed',
      policy: buildPtyApprovalDecision(),
      result: { error: message },
      toolName: 'pty_create',
    })

    return {
      content: [textContent(`PTY create failed: ${message}`)],
      isError: true,
      structuredContent: {
        error: message,
        status: 'error',
      },
    }
  }
}

export function registerPtyTools({ runtime, server }: RegisterPtyToolsOptions) {
  // Helper: resolve current task/step ids for audit
  function currentIds(): { stepId?: string, taskId?: string } {
    const task = runtime.stateManager.getState().activeTask
    if (!task)
      return {}
    const step = task.steps[task.currentStepIndex]
    return { stepId: step?.stepId, taskId: task.id }
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
          ptyAvailable: availability.available,
          status: 'ok',
          ...(availability.error ? { error: availability.error } : {}),
          sessions: sessions.map(s => ({
            alive: s.alive,
            boundStepId: trackedSessions.find(entry => entry.id === s.id)?.boundStepId,
            boundWorkflowStepLabel: trackedSessions.find(entry => entry.id === s.id)?.boundWorkflowStepLabel,
            cols: s.cols,
            id: s.id,
            lastInteractionAt: trackedSessions.find(entry => entry.id === s.id)?.lastInteractionAt,
            pid: s.pid,
            rows: s.rows,
          })),
        },
      }
    },
  )

  server.tool(
    'pty_create',
    {
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to bind the PTY Open Grant'),
      cols: z.number().int().min(1).max(500).optional().describe('Terminal columns (default: 80)'),
      cwd: z.string().optional().describe('Initial working directory'),
      rows: z.number().int().min(1).max(200).optional().describe('Terminal rows (default: 24)'),
      stepId: z.string().min(1).optional().describe('Stable workflow step id to bind this PTY session to'),
      workflowStepLabel: z.string().min(1).optional().describe('(deprecated) Workflow step label for backward compat'),
    },
    async ({ approvalSessionId, cols, cwd, rows, stepId, workflowStepLabel }) => {
      const availability = await getPtyAvailabilityInfo()
      if (!availability.available) {
        return {
          content: [textContent(`PTY support unavailable: ${availability.error || 'node-pty could not be loaded.'}`)],
          isError: true,
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
          action: {
            input: {
              approvalSessionId,
              cols,
              cwd,
              rows,
              stepId,
              workflowStepLabel,
            },
            kind: 'pty_create',
          },
          context,
          policy: decision,
          toolName: 'pty_create',
        })
        runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

        await runtime.session.record({
          action: pending.action,
          context,
          event: 'approval_required',
          policy: decision,
          result: {
            pendingActionId: pending.id,
          },
          toolName: 'pty_create',
        })

        return buildApprovalResponse(pending, decision, context, {
          approvalReason: 'PTY session creation opens an interactive terminal surface and should be explicitly approved once per session.',
          intent: 'Create an interactive PTY session',
        })
      }

      return executeApprovedPtyCreate(runtime, {
        approvalSessionId,
        cols,
        cwd,
        rows,
        stepId,
        workflowStepLabel,
      })
    },
  )

  const createSendInputHandler = (toolName: 'pty_send_input' | 'pty_write') => async ({ approvalSessionId, data, sessionId }: { approvalSessionId?: string, data: string, sessionId: string }) => {
    const grantError = requirePtyGrant({
      approvalSessionId,
      operation: toolName,
      runtime,
      sessionId,
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
        byteCount: data.length,
        event: 'send_input',
        inputPreview: auditPreview(data),
        ptySessionId: sessionId,
      })

      return {
        content: [textContent(`Wrote ${data.length} byte(s) to ${sessionId}.`)],
        structuredContent: {
          bytesWritten: data.length,
          sessionId,
          status: 'ok',
        },
      }
    }
    catch (error) {
      return {
        content: [textContent(`PTY send_input failed: ${errorMessageFromValue(error)}`)],
        isError: true,
        structuredContent: {
          error: errorMessageFromValue(error),
          status: 'error',
        },
      }
    }
  }

  const sendInputSchema = {
    approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
    data: z.string().describe('Data to write to the PTY (keystrokes, commands, etc.). Use \\r for Enter, \\x03 for Ctrl+C.'),
    sessionId: z.string().min(1).describe('PTY session id from pty_create'),
  }

  // Primary name
  server.tool('pty_send_input', sendInputSchema, createSendInputHandler('pty_send_input'))
  // Compat alias — kept for backward compatibility, not the canonical name
  server.tool('pty_write', sendInputSchema, createSendInputHandler('pty_write'))

  server.tool(
    'pty_read_screen',
    {
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
      maxLines: z.number().int().min(1).max(500).optional().describe('Maximum lines to return from the terminal buffer (default: terminal rows)'),
      sessionId: z.string().min(1).describe('PTY session id'),
    },
    async ({ approvalSessionId, maxLines, sessionId }) => {
      const grantError = requirePtyGrant({
        approvalSessionId,
        operation: 'pty_read_screen',
        runtime,
        sessionId,
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
          alive: session.alive,
          event: 'read_screen',
          ptySessionId: sessionId,
          returnedLineCount: lineCount,
        })

        const structuredContent: Record<string, unknown> = {
          alive: session.alive,
          cols: session.cols,
          rows: session.rows,
          screenContent: session.screenContent,
          session: {
            alive: session.alive,
            cols: session.cols,
            id: session.id,
            pid: session.pid,
            rows: session.rows,
          },
          sessionId: session.id,
          status: 'ok',
        }

        const response: CallToolResult = {
          content: [textContent(session.screenContent || '(empty)')],
          structuredContent,
        }

        // --- Hygiene Heuristics ---
        const content = session.screenContent || ''
        const lines = content.split('\n')
        let lastLine = ''
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          if (lines[index].trim().length > 0) {
            lastLine = lines[index]
            break
          }
        }

        // 1. Pagination Nudge
        const pagination = detectPagination(content)
        if (pagination) {
          response.content.push(textContent(`\n[NUDGE] ${pagination.reason}. You may need to press ${pagination.suggestedAction === 'press_space' ? 'Space' : 'q'}.`))
          structuredContent.suggestedInteraction = pagination.suggestedAction
        }

        // 2. Best-effort CWD Recovery
        const extractedCwd = extractCwdFromPrompt(lastLine)
        if (extractedCwd) {
          runtime.stateManager.updatePtySessionObservedCwd(sessionId, extractedCwd)
          structuredContent.observedCwd = extractedCwd
        }

        return response
      }
      catch (error) {
        return {
          content: [textContent(`PTY read failed: ${errorMessageFromValue(error)}`)],
          isError: true,
          structuredContent: {
            error: errorMessageFromValue(error),
            status: 'error',
          },
        }
      }
    },
  )

  server.tool(
    'pty_resize',
    {
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
      cols: z.number().int().min(1).max(500).describe('New terminal column count'),
      rows: z.number().int().min(1).max(200).describe('New terminal row count'),
      sessionId: z.string().min(1).describe('PTY session id'),
    },
    async ({ approvalSessionId, cols, rows, sessionId }) => {
      const grantError = requirePtyGrant({
        approvalSessionId,
        operation: 'pty_resize',
        runtime,
        sessionId,
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
          cols,
          event: 'resize',
          ptySessionId: sessionId,
          rows,
        })

        return {
          content: [textContent(`Resized ${sessionId} to ${cols}x${rows}.`)],
          structuredContent: {
            cols,
            rows,
            sessionId,
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [textContent(`PTY resize failed: ${errorMessageFromValue(error)}`)],
          isError: true,
          structuredContent: {
            error: errorMessageFromValue(error),
            status: 'error',
          },
        }
      }
    },
  )

  server.tool(
    'pty_destroy',
    {
      approvalSessionId: z.string().min(1).optional().describe('(internal) Approval session id used to validate the PTY Open Grant'),
      sessionId: z.string().min(1).describe('PTY session id to destroy'),
    },
    async ({ approvalSessionId, sessionId }) => {
      const grantError = requirePtyGrant({
        approvalSessionId,
        operation: 'pty_destroy',
        runtime,
        sessionId,
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
          actor: 'tool_call',
          event: 'destroy',
          outcome: 'ok',
          ptySessionId: sessionId,
        })
      }

      return {
        content: [textContent(destroyed ? `Destroyed ${sessionId}.` : `Session not found: ${sessionId}.`)],
        structuredContent: {
          sessionId,
          status: destroyed ? 'ok' : 'not_found',
        },
      }
    },
  )
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

function buildApprovalSessionRequiredResponse(operation: string): CallToolResult {
  return {
    content: [
      textContent(`${operation} requires an approval session id when approvals are enabled.`),
    ],
    isError: true,
    structuredContent: {
      operation,
      status: 'approval_session_required',
    },
  }
}

function buildPtyApprovalDecision(): PolicyDecision {
  return {
    allowed: true,
    estimatedOperationUnits: 4,
    reason: 'Creating an interactive PTY session requires approval.',
    reasons: ['Creating an interactive PTY session requires approval.'],
    requiresApproval: true,
    riskLevel: 'high',
  }
}

function buildPtyGrantRequiredResponse(operation: string, sessionId: string): CallToolResult {
  return {
    content: [
      textContent(`${operation} requires an active PTY Open Grant for session ${sessionId}. Create or approve the PTY session first.`),
    ],
    isError: true,
    structuredContent: {
      operation,
      sessionId,
      status: 'pty_grant_required',
    },
  }
}

function getApprovalContext(runtime: ComputerUseServerRuntime): ForegroundContext {
  return runtime.stateManager.getState().foregroundContext
    ?? { available: false, platform: process.platform as NodeJS.Platform }
}

function requirePtyGrant(params: {
  approvalSessionId?: string
  operation: string
  runtime: ComputerUseServerRuntime
  sessionId: string
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

// ---------------------------------------------------------------------------
// Workflow self-acquire PTY callback factory
// ---------------------------------------------------------------------------

function requiresPtyApproval(runtime: ComputerUseServerRuntime) {
  return runtime.config.approvalMode !== 'never'
}

/**
 * Cleanup helper — destroy all PTY sessions. Called on server shutdown.
 */
export { destroyAllPtySessions }
