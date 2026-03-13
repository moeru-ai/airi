import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecutePrepTool } from '../workflows/engine'
import type { ComputerUseServerRuntime } from './runtime'

import { destroyPtySession, readPtyScreen, writeToPty } from '../terminal/pty-runner'
import { textContent } from './content'

function auditPreview(data: string, maxLen = 80) {
  if (data.length <= maxLen)
    return data
  return `${data.slice(0, maxLen)}…`
}

function prepToolErrorResult(label: string, error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error)

  return {
    isError: true,
    content: [
      textContent(`${label} failed: ${message}`),
    ],
    structuredContent: {
      status: 'error',
      error: message,
    },
  }
}

export function createWorkflowTerminalPrepToolExecutor(runtime: ComputerUseServerRuntime): ExecutePrepTool {
  return async (toolName) => {
    const currentIds = () => {
      const task = runtime.stateManager.getState().activeTask
      const step = task?.steps[task.currentStepIndex]
      return {
        taskId: task?.id,
        stepId: step?.stepId,
      }
    }

    if (toolName === 'pty_read_screen') {
      try {
        const state = runtime.stateManager.getState()
        const currentStepLabel = state.activeTask?.steps[state.activeTask.currentStepIndex]?.label
        const trackedSession = (currentStepLabel
          ? state.ptySessions.find(session => session.alive && session.boundWorkflowStepLabel === currentStepLabel)
          : undefined)
        ?? (state.activePtySessionId
          ? state.ptySessions.find(session => session.alive && session.id === state.activePtySessionId)
          : undefined)

        if (!trackedSession) {
          return {
            isError: true,
            content: [
              textContent('PTY read screen failed: no active or step-bound PTY session is available.'),
            ],
            structuredContent: {
              status: 'unavailable',
            },
          }
        }

        const session = readPtyScreen(trackedSession.id, { maxLines: trackedSession.rows })
        runtime.stateManager.touchPtySession(trackedSession.id)
        runtime.stateManager.updatePtySessionAlive(trackedSession.id, session.alive)
        runtime.stateManager.appendPtyAudit({
          ...currentIds(),
          ptySessionId: trackedSession.id,
          event: 'read_screen',
          returnedLineCount: session.screenContent.split('\n').filter(Boolean).length,
          alive: session.alive,
        })

        return {
          content: [
            textContent(session.screenContent || '(empty)'),
          ],
          structuredContent: {
            status: 'ok',
            sessionId: session.id,
            alive: session.alive,
            pid: session.pid,
            rows: session.rows,
            cols: session.cols,
            screenContent: session.screenContent,
            executionReason: `Tracked PTY session "${session.id}" is available for direct terminal interaction.`,
          },
        }
      }
      catch (error) {
        return prepToolErrorResult('PTY read screen', error)
      }
    }

    if (toolName.startsWith('pty_send_input:')) {
      const parts = toolName.split(':')
      const sessionId = parts[1]
      const data = parts.slice(2).join(':')
      try {
        writeToPty(sessionId, { data })
        runtime.stateManager.touchPtySession(sessionId)
        runtime.stateManager.appendPtyAudit({
          ...currentIds(),
          ptySessionId: sessionId,
          event: 'send_input',
          byteCount: data.length,
          inputPreview: auditPreview(data),
        })
        return {
          content: [textContent(`Wrote ${data.length} byte(s) to ${sessionId}.`)],
          structuredContent: { status: 'ok', sessionId, bytesWritten: data.length },
        }
      }
      catch (error) {
        return prepToolErrorResult('PTY send_input', error)
      }
    }

    if (toolName.startsWith('pty_read_screen:')) {
      const sessionId = toolName.slice('pty_read_screen:'.length)
      try {
        const session = readPtyScreen(sessionId, {})
        runtime.stateManager.touchPtySession(sessionId)
        runtime.stateManager.updatePtySessionAlive(sessionId, session.alive)
        runtime.stateManager.appendPtyAudit({
          ...currentIds(),
          ptySessionId: sessionId,
          event: 'read_screen',
          returnedLineCount: session.screenContent.split('\n').filter(Boolean).length,
          alive: session.alive,
        })
        return {
          content: [textContent(session.screenContent || '(empty)')],
          structuredContent: {
            status: 'ok',
            sessionId: session.id,
            alive: session.alive,
            pid: session.pid,
            rows: session.rows,
            cols: session.cols,
            screenContent: session.screenContent,
          },
        }
      }
      catch (error) {
        return prepToolErrorResult('PTY read_screen', error)
      }
    }

    if (toolName.startsWith('pty_destroy:')) {
      const sessionId = toolName.slice('pty_destroy:'.length)
      try {
        destroyPtySession(sessionId)
        runtime.stateManager.unregisterPtySession(sessionId)
        runtime.stateManager.revokePtyApproval(sessionId)
        runtime.stateManager.appendPtyAudit({
          ...currentIds(),
          ptySessionId: sessionId,
          event: 'destroy',
          actor: 'workflow_prep',
          outcome: 'ok',
        })
        return {
          content: [textContent(`Destroyed PTY session ${sessionId}.`)],
          structuredContent: { status: 'ok', sessionId },
        }
      }
      catch (error) {
        return prepToolErrorResult('PTY destroy', error)
      }
    }

    return {
      isError: true,
      content: [
        textContent(`Workflow prep tool is not supported: ${toolName}`),
      ],
      structuredContent: {
        status: 'unsupported',
        toolName,
      },
    }
  }
}
