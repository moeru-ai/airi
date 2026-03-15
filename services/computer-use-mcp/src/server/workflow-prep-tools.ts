import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecutePrepTool } from '../workflows/engine'
import type { ComputerUseServerRuntime } from './runtime'

import { captureAXTree, formatAXSnapshotAsText } from '../accessibility'
import { enumerateDisplays, formatDisplaySummary } from '../display'
import { destroyPtySession, readPtyScreen, writeToPty } from '../terminal/pty-runner'
import { textContent } from './content'

function auditPreview(data: string, maxLen = 80) {
  if (data.length <= maxLen)
    return data
  return `${data.slice(0, maxLen)}…`
}

function requireWorkflowPrepPtyGrant(runtime: ComputerUseServerRuntime, sessionId: string, operation: string): CallToolResult | undefined {
  if (runtime.config.approvalMode === 'never')
    return undefined

  const hasGrant = runtime.stateManager.getActivePtyGrants().some(grant => grant.active && grant.ptySessionId === sessionId)
  if (hasGrant)
    return undefined

  return {
    isError: true,
    content: [
      textContent(`${operation} failed: PTY session ${sessionId} has no active approval grant.`),
    ],
    structuredContent: {
      status: 'pty_grant_required',
      operation,
      sessionId,
    },
  }
}

export function createWorkflowPrepToolExecutor(runtime: ComputerUseServerRuntime): ExecutePrepTool {
  return async (toolName) => {
    const currentIds = () => {
      const task = runtime.stateManager.getState().activeTask
      const step = task?.steps[task.currentStepIndex]
      return {
        taskId: task?.id,
        stepId: step?.stepId,
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
              status: 'ok',
              displayCount: snapshot.displays.length,
              displays: snapshot.displays.map(d => ({
                displayId: d.displayId,
                isMain: d.isMain,
                isBuiltIn: d.isBuiltIn,
                bounds: d.bounds,
                visibleBounds: d.visibleBounds,
                scaleFactor: d.scaleFactor,
                pixelWidth: d.pixelWidth,
                pixelHeight: d.pixelHeight,
              })),
              combinedBounds: snapshot.combinedBounds,
              capturedAt: snapshot.capturedAt,
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
              status: 'ok',
              appName: snapshot.appName,
              pid: snapshot.pid,
              snapshotId: snapshot.snapshotId,
              nodeCount: snapshot.uidToNode.size,
              truncated: snapshot.truncated,
              capturedAt: snapshot.capturedAt,
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
              status: 'ok',
              elementCount: elements.length,
              elements,
              page: {
                url: status.pageUrl,
                title: status.pageTitle,
              },
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
              isError: true,
              content: [
                textContent(`Browser DOM read page failed: ${status.lastError || 'browser extension bridge is not connected'}`),
              ],
              structuredContent: {
                status: 'unavailable',
                bridge: status,
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
              status: 'ok',
              frames,
              bridge: runtime.browserDomBridge.getStatus(),
              frameCount: frames.length,
              interactiveElementCount,
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
              isError: true,
              content: [
                textContent('PTY read screen failed: no active or step-bound PTY session is available.'),
              ],
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
            const grantError = requireWorkflowPrepPtyGrant(runtime, sessionId, 'pty_read_screen')
            if (grantError) {
              return grantError
            }

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
            const grantError = requireWorkflowPrepPtyGrant(runtime, sessionId, 'pty_destroy')
            if (grantError) {
              return grantError
            }

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
  }
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
