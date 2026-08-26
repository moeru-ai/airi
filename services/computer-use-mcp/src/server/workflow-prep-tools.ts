import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecutePrepTool } from '../workflows/engine'
import type { ComputerUseServerRuntime } from './runtime'

import { captureAXTree, formatAXSnapshotAsText } from '../accessibility'
import { enumerateDisplays, formatDisplaySummary } from '../display'
import { destroyPtySession, readPtyScreen, writeToPty } from '../terminal/pty-runner'
import { errorMessageFromValue } from '../utils/error-message'
import { textContent } from './content'

export function createWorkflowPrepToolExecutor(runtime: ComputerUseServerRuntime): ExecutePrepTool {
  return async (toolName) => {
    const currentIds = () => {
      const task = runtime.stateManager.getState().activeTask
      const step = task?.steps[task.currentStepIndex]
      return {
        stepId: step?.stepId,
        taskId: task?.id,
      }
    }

    switch (toolName) {
      case 'display_enumerate': {
        try {
          const snapshot = await enumerateDisplays(runtime.config)
          const summary = formatDisplaySummary(snapshot)

          return {
            content: [
              textContent(summary),
            ],
            structuredContent: {
              capturedAt: snapshot.capturedAt,
              combinedBounds: snapshot.combinedBounds,
              displayCount: snapshot.displays.length,
              displays: snapshot.displays.map(d => ({
                bounds: d.bounds,
                displayId: d.displayId,
                isBuiltIn: d.isBuiltIn,
                isMain: d.isMain,
                pixelHeight: d.pixelHeight,
                pixelWidth: d.pixelWidth,
                scaleFactor: d.scaleFactor,
                visibleBounds: d.visibleBounds,
              })),
              status: 'ok',
            },
          }
        }
        catch (error) {
          return prepToolErrorResult('Display enumeration', error)
        }
      }

      case 'accessibility_snapshot': {
        try {
          const snapshot = await captureAXTree(runtime.config, {})
          const text = formatAXSnapshotAsText(snapshot, {
            includeBounds: false,
            includeUids: true,
          })

          return {
            content: [
              textContent(text),
            ],
            structuredContent: {
              appName: snapshot.appName,
              capturedAt: snapshot.capturedAt,
              nodeCount: snapshot.uidToNode.size,
              pid: snapshot.pid,
              snapshotId: snapshot.snapshotId,
              status: 'ok',
              truncated: snapshot.truncated,
            },
          }
        }
        catch (error) {
          return prepToolErrorResult('Accessibility snapshot', error)
        }
      }

      case 'browser_cdp_collect_elements': {
        try {
          const bridge = await runtime.cdpBridgeManager.ensureBridge()
          const elements = await bridge.collectInteractiveElements()
          const status = bridge.getStatus()

          return {
            content: [
              textContent(`Collected ${elements.length} interactive element(s) from ${status.pageTitle}.`),
            ],
            structuredContent: {
              elementCount: elements.length,
              elements,
              page: {
                title: status.pageTitle,
                url: status.pageUrl,
              },
              status: 'ok',
            },
          }
        }
        catch (error) {
          return prepToolErrorResult('CDP collect elements', error)
        }
      }

      case 'browser_dom_read_page': {
        try {
          const status = runtime.browserDomBridge.getStatus()
          if (!status.connected) {
            return {
              content: [
                textContent(`Browser DOM read page failed: ${status.lastError || 'browser extension bridge is not connected'}`),
              ],
              isError: true,
              structuredContent: {
                bridge: status,
                status: 'unavailable',
              },
            }
          }

          const frames = await runtime.browserDomBridge.readAllFramesDom({
            includeText: true,
            maxElements: 200,
          })
          const interactiveElementCount = frames.reduce((count, frame) => {
            const result = frame.result
            const payload = result && typeof result === 'object' && !Array.isArray(result) && 'data' in result
              ? result.data
              : result
            const record = payload && typeof payload === 'object' && !Array.isArray(payload)
              ? payload as Record<string, unknown>
              : undefined
            const elements = Array.isArray(record?.interactiveElements) ? record.interactiveElements : []

            return count + elements.length
          }, 0)

          return {
            content: [
              textContent(`Read DOM from ${frames.length} frame(s); collected ${interactiveElementCount} interactive element(s).`),
            ],
            structuredContent: {
              bridge: runtime.browserDomBridge.getStatus(),
              frameCount: frames.length,
              frames,
              interactiveElementCount,
              status: 'ok',
            },
          }
        }
        catch (error) {
          return prepToolErrorResult('Browser DOM read page', error)
        }
      }

      case 'pty_read_screen': {
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
              content: [
                textContent('PTY read screen failed: no active or step-bound PTY session is available.'),
              ],
              isError: true,
              structuredContent: {
                status: 'unavailable',
              },
            }
          }

          const grantError = requireWorkflowPrepPtyGrant(runtime, trackedSession.id, 'pty_read_screen')
          if (grantError) {
            return grantError
          }

          const session = readPtyScreen(trackedSession.id, { maxLines: trackedSession.rows })
          runtime.stateManager.touchPtySession(trackedSession.id)
          runtime.stateManager.updatePtySessionAlive(trackedSession.id, session.alive)
          runtime.stateManager.appendPtyAudit({
            ...currentIds(),
            alive: session.alive,
            event: 'read_screen',
            ptySessionId: trackedSession.id,
            returnedLineCount: session.screenContent.split('\n').filter(Boolean).length,
          })

          return {
            content: [
              textContent(session.screenContent || '(empty)'),
            ],
            structuredContent: {
              alive: session.alive,
              cols: session.cols,
              executionReason: `Tracked PTY session "${session.id}" is available for direct terminal interaction.`,
              pid: session.pid,
              rows: session.rows,
              screenContent: session.screenContent,
              sessionId: session.id,
              status: 'ok',
            },
          }
        }
        catch (error) {
          return prepToolErrorResult('PTY read screen', error)
        }
      }

      default: {
        // -- PTY step family dispatch (format: "pty_<op>:<sessionId>[:<data>]") --
        if (toolName.startsWith('pty_send_input:')) {
          const parts = toolName.split(':')
          const sessionId = parts[1]
          const data = parts.slice(2).join(':')
          try {
            const grantError = requireWorkflowPrepPtyGrant(runtime, sessionId, 'pty_send_input')
            if (grantError) {
              return grantError
            }

            writeToPty(sessionId, { data })
            runtime.stateManager.touchPtySession(sessionId)
            runtime.stateManager.appendPtyAudit({
              ...currentIds(),
              byteCount: data.length,
              event: 'send_input',
              inputPreview: auditPreview(data),
              ptySessionId: sessionId,
            })
            return {
              content: [textContent(`Wrote ${data.length} byte(s) to ${sessionId}.`)],
              structuredContent: { bytesWritten: data.length, sessionId, status: 'ok' },
            }
          }
          catch (error) {
            return prepToolErrorResult('PTY send_input', error)
          }
        }

        if (toolName.startsWith('pty_read_screen:')) {
          const sessionId = toolName.slice('pty_read_screen:'.length)
          try {
            const grantError = requireWorkflowPrepPtyGrant(runtime, sessionId, 'pty_read_screen')
            if (grantError) {
              return grantError
            }

            const session = readPtyScreen(sessionId, {})
            runtime.stateManager.touchPtySession(sessionId)
            runtime.stateManager.updatePtySessionAlive(sessionId, session.alive)
            runtime.stateManager.appendPtyAudit({
              ...currentIds(),
              alive: session.alive,
              event: 'read_screen',
              ptySessionId: sessionId,
              returnedLineCount: session.screenContent.split('\n').filter(Boolean).length,
            })
            return {
              content: [textContent(session.screenContent || '(empty)')],
              structuredContent: {
                alive: session.alive,
                cols: session.cols,
                pid: session.pid,
                rows: session.rows,
                screenContent: session.screenContent,
                sessionId: session.id,
                status: 'ok',
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
            const grantError = requireWorkflowPrepPtyGrant(runtime, sessionId, 'pty_destroy')
            if (grantError) {
              return grantError
            }

            destroyPtySession(sessionId)
            runtime.stateManager.unregisterPtySession(sessionId)
            runtime.stateManager.revokePtyApproval(sessionId)
            runtime.stateManager.appendPtyAudit({
              ...currentIds(),
              actor: 'workflow_prep',
              event: 'destroy',
              outcome: 'ok',
              ptySessionId: sessionId,
            })
            return {
              content: [textContent(`Destroyed PTY session ${sessionId}.`)],
              structuredContent: { sessionId, status: 'ok' },
            }
          }
          catch (error) {
            return prepToolErrorResult('PTY destroy', error)
          }
        }

        return {
          content: [
            textContent(`Workflow prep tool is not supported: ${toolName}`),
          ],
          isError: true,
          structuredContent: {
            status: 'unsupported',
            toolName,
          },
        }
      }
    }
  }
}

function auditPreview(data: string, maxLen = 80) {
  if (data.length <= maxLen)
    return data
  return `${data.slice(0, maxLen)}…`
}

function prepToolErrorResult(label: string, error: unknown): CallToolResult {
  const message = errorMessageFromValue(error)

  return {
    content: [
      textContent(`${label} failed: ${message}`),
    ],
    isError: true,
    structuredContent: {
      error: message,
      status: 'error',
    },
  }
}

function requireWorkflowPrepPtyGrant(runtime: ComputerUseServerRuntime, sessionId: string, operation: string): CallToolResult | undefined {
  if (runtime.config.approvalMode === 'never')
    return undefined

  const hasGrant = runtime.stateManager.getActivePtyGrants().some(grant => grant.active && grant.ptySessionId === sessionId)
  if (hasGrant)
    return undefined

  return {
    content: [
      textContent(`${operation} failed: PTY session ${sessionId} has no active approval grant.`),
    ],
    isError: true,
    structuredContent: {
      operation,
      sessionId,
      status: 'pty_grant_required',
    },
  }
}
