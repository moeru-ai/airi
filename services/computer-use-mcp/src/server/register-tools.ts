import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { CodingVerificationGateReasonCode } from '../coding/verification-gate'
import type {
  CrossLaneConstraint,
  CrossLaneHandoffReason,
  CrossLaneSurface,
} from '../lane-handoff-contract'
import type {
  BrowserDomFrameResult,
  ClickActionInput,
  FocusAppActionInput,
  OpenAppActionInput,
  SecretReadEnvValueActionInput,
  TerminalExecActionInput,
  TypeTextActionInput,
} from '../types'
import type { WorkflowSuspension } from '../workflows'
import type { ExecuteAction } from './action-executor'
import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import {
  deriveCodingOperationalMemorySeeds,
  pickPrimaryOperationalMemory,
  summarizeOperationalMemory,
} from '../coding/coding-memory-taxonomy'
import { CodingPrimitives } from '../coding/primitives'
import { evaluateCodingVerificationGate } from '../coding/verification-gate'
import { evaluateCodingVerificationNudge } from '../coding/verification-nudge'
import {
  CROSS_LANE_ALLOWED_ROUTES,
  validateCrossLaneRoute,
} from '../lane-handoff-contract'
import { getRuntimePreflight } from '../preflight'
import { summarizeRunState } from '../transparency'
import {
  createAppBrowseAndActWorkflow,
  createCodingAgenticLoopWorkflow,
  createCodingExecutionLoopWorkflow,
  createDevInspectFailureWorkflow,
  createDevOpenWorkspaceWorkflow,
  createDevRunTestsWorkflow,
  createDevValidateWorkspaceWorkflow,
  executeWorkflow,
  resumeWorkflow,
} from '../workflows'
import { textContent } from './content'
import {
  describeExecutionTarget,
  describeForegroundContext,
  summarizeCoordinateSpace,
} from './formatters'
import { registerCodingTools } from './register-coding'
import { createAcquirePtyCallback, executeApprovedPtyCreate } from './register-pty'
import { registerToolWithDescriptor, requireDescriptor } from './tool-descriptors/register-helper'
import {
  captureClickEvidence,
  captureHandoffEvidence,
  captureUiInteractionEvidence,
} from './verification-evidence-capture'
import { formatWorkflowStructuredContent } from './workflow-formatter'
import { createWorkflowPrepToolExecutor } from './workflow-prep-tools'

export interface RegisterComputerUseToolsOptions {
  server: McpServer
  runtime: ComputerUseServerRuntime
  executeAction: ExecuteAction
  enableTestTools: boolean
}

const optionalTabIdSchema = z.number().int().min(0).optional().describe('Optional browser tab id override; defaults to the active tab')
const optionalFrameIdsSchema = z.array(z.number().int().min(0)).min(1).optional().describe('Optional frame ids to target; omit to let the bridge inspect all frames')

function toBrowserDomRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  return value as Record<string, unknown>
}

function unwrapBrowserDomResult(value: unknown) {
  const record = toBrowserDomRecord(value)
  if (!record)
    return value

  if ('data' in record)
    return record.data

  return value
}

function didBrowserDomFrameSucceed(frame: BrowserDomFrameResult<unknown>) {
  const record = toBrowserDomRecord(frame.result)
  if (!record)
    return Boolean(frame.result)

  if ('success' in record)
    return Boolean(record.success)

  return true
}

function summarizeBrowserDomFrameResults(label: string, results: Array<BrowserDomFrameResult<unknown>>) {
  const successfulFrames = results.filter(didBrowserDomFrameSucceed)
  return `${label}: ${successfulFrames.length}/${results.length} frame(s) succeeded.`
}

function buildBrowserDomUnavailableResponse(runtime: ComputerUseServerRuntime) {
  const status = runtime.browserDomBridge.getStatus()
  return {
    isError: true,
    content: [
      textContent(`Browser DOM bridge is unavailable: ${status.lastError || 'the browser extension is not connected yet'}.`),
    ],
    structuredContent: {
      status: 'unavailable',
      bridge: status,
    },
  }
}

async function getReadyStateNudge(runtime: ComputerUseServerRuntime, tabId?: number, frameIds?: number[]): Promise<{ nudge: string; warning: string | undefined }> {
  try {
    if (!runtime.browserDomBridge.getStatus().connected) return { nudge: '', warning: undefined }
    const states = await runtime.browserDomBridge.getReadyState({ tabId, frameIds })
    const stillLoading = states.filter(s => s.result !== 'complete')
    if (stillLoading.length > 0) {
      const warning = stillLoading.map(s => `Frame ${s.frameId}: ${s.result}`).join(', ')
      const nudge = `\n\n💡 Advisory: The page is still loading (${warning}). Elements might shift or not be fully interactive. Proceed with caution.`
      return { nudge, warning }
    }
  } catch (e) {
    // optional extension method might not be implemented
  }
  return { nudge: '', warning: undefined }
}

export function registerComputerUseTools(params: RegisterComputerUseToolsOptions) {
  const { server, runtime, executeAction, enableTestTools } = params
  const executePrepTool = createWorkflowPrepToolExecutor(runtime)
  registerCodingTools(params)
  const acquirePty = createAcquirePtyCallback(runtime)
  const coordinator = runtime.coordinator

  async function refreshWorkflowRunState() {
    await coordinator.refreshSnapshot('workflow_start')
  }

  // Workflow suspension state — stored in this closure so that
  // workflow_resume and the approve handler can access it.
  let suspendedWorkflow: WorkflowSuspension | undefined

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_get_capabilities'),
    schema: {},

    handler: async () => {
      const snapshot = await coordinator.refreshSnapshot('tool_entry')
      const surfaceSummary = coordinator.getSurfaceSummary()
      const [permissionInfo] = await Promise.all([
        runtime.executor.getPermissionInfo(),
      ])

      const { executionTarget, foregroundContext: context, displayInfo, browserSurfaceAvailability } = snapshot
      const sessionSnapshot = runtime.session.getSnapshot()
      const preflight = getRuntimePreflight({
        config: runtime.config,
        lastScreenshot: runtime.session.getLastScreenshot(),
        displayInfo,
        executionTarget,
      })

      return {
        content: [
          textContent(
            `Executor=${runtime.config.executor}, host=${preflight.launchContext.hostName}, target=${describeExecutionTarget(executionTarget)}, sessionTag=${preflight.launchContext.sessionTag || 'missing'}, coordinateSpace=${summarizeCoordinateSpace(preflight.coordinateSpace)}. Foreground=${describeForegroundContext(context)}.`,
          ),
        ],
        structuredContent: {
          executor: runtime.executor.describe(),
          launchContext: preflight.launchContext,
          executionTarget,
          displayInfo,
          surfaceSummary,
          permissions: permissionInfo,
          coordinateSpace: preflight.coordinateSpace,
          mutationGuards: {
            applies: runtime.config.executor !== 'dry-run',
            requireSessionTagForMutatingActions: runtime.config.requireSessionTagForMutatingActions,
            requireAllowedBoundsForMutatingActions: runtime.config.requireAllowedBoundsForMutatingActions,
            requireCoordinateAlignmentForMutatingActions: runtime.config.requireCoordinateAlignmentForMutatingActions,
            readyForMutations: preflight.mutationReadinessIssues.length === 0,
            blockingIssues: preflight.mutationReadinessIssues,
          },
          policy: {
            approvalMode: runtime.config.approvalMode,
            allowedBounds: runtime.config.allowedBounds,
            allowApps: runtime.config.allowApps,
            denyApps: runtime.config.denyApps,
            denyWindowTitles: runtime.config.denyWindowTitles,
            openableApps: runtime.config.openableApps,
            maxOperations: runtime.config.maxOperations,
            maxOperationUnits: runtime.config.maxOperationUnits,
            defaultCaptureAfter: runtime.config.defaultCaptureAfter,
          },
          session: sessionSnapshot,
          foregroundContext: context,
          windowAutomation: runtime.config.executor === 'macos-local'
            ? 'NSWorkspace + CGWindowList + Quartz'
            : runtime.config.executor === 'linux-x11'
              ? 'remote X11 runner'
              : 'dry-run',
          supportedAppsForOpenFocus: runtime.config.openableApps,
          approvalUx: 'electron-dialog',
          coordScope: 'global-screen',
          appPolicy: 'deny-only',
          terminalBackend: runtime.terminalRunner.describe().kind,
          browserDomBridge: runtime.browserDomBridge.getStatus(),
          browserSurfaceAvailability,
        },
      }
    },
  })

  if (enableTestTools && runtime.executor.openTestTarget) {
    registerToolWithDescriptor(server, {
      descriptor: requireDescriptor('desktop_open_test_target'),
      schema: {},

      handler: async () => {
        const result = await runtime.executor.openTestTarget!()

        return {
          content: [
            textContent(`Opened ${result.appName} on ${describeExecutionTarget(result.executionTarget)}.`),
          ],
          structuredContent: {
            status: 'executed',
            appName: result.appName,
            windowTitle: result.windowTitle,
            recommendedClickPoint: result.recommendedClickPoint,
            executionTarget: result.executionTarget,
          },
        }
      },
    })
  }

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_observe_windows'),

    schema: {
      limit: z.number().int().min(1).max(32).optional().describe('Maximum number of visible windows to return'),
      app: z.string().optional().describe('Optional app-name substring filter'),
    },

    handler: async input => executeAction({ kind: 'observe_windows', input }, 'desktop_observe_windows'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_screenshot'),

    schema: {
      label: z.string().optional().describe('Optional label for the saved screenshot file'),
    },

    handler: async ({ label }) => executeAction({ kind: 'screenshot', input: { label } }, 'desktop_screenshot'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_open_app'),

    schema: {
      app: z.string().min(1).describe('Application name from COMPUTER_USE_OPENABLE_APPS'),
    },

    handler: async (input: OpenAppActionInput) => executeAction({ kind: 'open_app', input }, 'desktop_open_app'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_focus_app'),

    schema: {
      app: z.string().min(1).describe('Application name from COMPUTER_USE_OPENABLE_APPS'),
    },

    handler: async (input: FocusAppActionInput) => executeAction({ kind: 'focus_app', input }, 'desktop_focus_app'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_click'),

    schema: {
      x: z.number().describe('Absolute screen X coordinate in pixels'),
      y: z.number().describe('Absolute screen Y coordinate in pixels'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button, default left'),
      clickCount: z.number().int().min(1).max(2).optional().describe('Number of clicks, default 1'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },

    handler: async (input: ClickActionInput) => executeAction({ kind: 'click', input }, 'desktop_click'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_type_text'),

    schema: {
      text: z.string().min(1).describe('Text to type into the focused UI element'),
      x: z.number().optional().describe('Optional X coordinate to click before typing'),
      y: z.number().optional().describe('Optional Y coordinate to click before typing'),
      pressEnter: z.boolean().optional().describe('Whether to press Enter after typing'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },

    handler: async (input: TypeTextActionInput) => executeAction({ kind: 'type_text', input }, 'desktop_type_text'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_press_keys'),

    schema: {
      keys: z.array(z.string()).min(1).describe('Single key chord, e.g. ["ctrl", "l"]'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },

    handler: async input => executeAction({ kind: 'press_keys', input }, 'desktop_press_keys'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_scroll'),

    schema: {
      x: z.number().optional().describe('Optional X coordinate to move to before scrolling'),
      y: z.number().optional().describe('Optional Y coordinate to move to before scrolling'),
      deltaX: z.number().optional().describe('Horizontal scroll delta in pixels'),
      deltaY: z.number().describe('Vertical scroll delta in pixels'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },

    handler: async input => executeAction({ kind: 'scroll', input }, 'desktop_scroll'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_wait'),

    schema: {
      durationMs: z.number().int().min(0).max(30_000).describe('Wait time in milliseconds'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the wait'),
    },

    handler: async input => executeAction({ kind: 'wait', input }, 'desktop_wait'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('terminal_exec'),

    schema: {
      command: z.string().min(1).describe('Shell command to execute in the local background runner'),
      cwd: z.string().optional().describe('Optional working directory override'),
      timeoutMs: z.number().int().min(1).max(120_000).optional().describe('Optional timeout override in milliseconds'),
    },

    handler: async (input: TerminalExecActionInput) => executeAction({ kind: 'terminal_exec', input }, 'terminal_exec'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('terminal_get_state'),
    schema: {},

    handler: async () => {
      const terminalState = runtime.session.getTerminalState()
      return {
        content: [
          textContent(`Terminal runner cwd=${terminalState.effectiveCwd}, lastExitCode=${terminalState.lastExitCode ?? 'n/a'}, lastCommand=${terminalState.lastCommandSummary || 'n/a'}.`),
        ],
        structuredContent: {
          status: 'ok',
          terminalState,
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('terminal_reset_state'),

    schema: {
      reason: z.string().optional().describe('Optional reset note for the audit log'),
    },

    handler: async input => executeAction({ kind: 'terminal_reset', input }, 'terminal_reset_state'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('secret_read_env_value'),

    schema: {
      filePath: z.string().min(1).describe('Absolute or explicit env file path to inspect, for example /Users/liuziheng/airi/.env'),
      keys: z.array(z.string().min(1)).min(1).max(16).describe('Candidate env variable names to try in order, e.g. ["AIRI_E2E_DISCORD_TOKEN", "DISCORD_BOT_TOKEN"]'),
      allowPlaceholder: z.boolean().optional().describe('Whether to allow obvious placeholder/template values such as replace-with-your-token'),
    },

    handler: async (input: SecretReadEnvValueActionInput) => executeAction({ kind: 'secret_read_env_value', input }, 'secret_read_env_value'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('clipboard_read_text'),

    schema: {
      maxLength: z.number().int().min(1).max(32_768).optional().describe('Optional maximum number of characters to return from the clipboard'),
      trim: z.boolean().optional().describe('Whether to trim leading/trailing whitespace before returning the text (default: true)'),
    },

    handler: async input => executeAction({ kind: 'clipboard_read_text', input }, 'clipboard_read_text'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('clipboard_write_text'),

    schema: {
      text: z.string().describe('Text to place into the system clipboard'),
    },

    handler: async input => executeAction({ kind: 'clipboard_write_text', input }, 'clipboard_write_text'),
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_get_bridge_status'),
    schema: {},

    handler: async () => {
      const bridge = runtime.browserDomBridge.getStatus()
      return {
        content: [
          textContent(`Browser DOM bridge ${bridge.connected ? 'connected' : 'disconnected'} on ws://${bridge.host}:${bridge.port}.`),
        ],
        structuredContent: {
          status: 'ok',
          bridge,
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_get_active_tab'),
    schema: {},

    handler: async () => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const activeTab = await runtime.browserDomBridge.getActiveTab()
      return {
        content: [
          textContent(`Active browser tab: ${String(activeTab?.title || activeTab?.url || 'unknown')}.`),
        ],
        structuredContent: {
          status: 'ok',
          activeTab,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_read_page'),

    schema: {
      includeText: z.boolean().optional().describe('Whether to include truncated body text for each frame'),
      maxElements: z.number().int().min(1).max(500).optional().describe('Maximum interactive elements per frame to collect'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ includeText, maxElements, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const frames = await runtime.browserDomBridge.readAllFramesDom({
        includeText,
        maxElements,
        tabId,
        frameIds,
      })
      const interactiveElementCount = frames.reduce((count, frame) => {
        const payload = unwrapBrowserDomResult(frame.result)
        const record = toBrowserDomRecord(payload)
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
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_find_elements'),

    schema: {
      selector: z.string().min(1).describe('CSS selector to query in the active tab frames'),
      maxResults: z.number().int().min(1).max(50).optional().describe('Maximum matched elements to include per frame'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, maxResults, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.findElements({
        selector,
        maxResults,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`find_elements for "${selector}"`, results)),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_click'),

    schema: {
      selector: z.string().min(1).describe('CSS selector to click via the browser extension bridge'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const { nudge, warning } = await getReadyStateNudge(runtime, tabId, frameIds)
      const result = await runtime.browserDomBridge.clickSelector({
        selector,
        tabId,
        frameIds,
      })

      // Evidence Capture: browser dom click
      captureClickEvidence(runtime, {
        source: 'browser_dom_click',
        actionKind: 'browser_dom_click',
        subject: selector,
        observed: {
          selector,
          targetFrameId: result.targetFrameId,
          targetPointX: result.targetPoint.x,
          targetPointY: result.targetPoint.y,
          appName: runtime.stateManager.getState().activeApp,
          windowTitle: runtime.stateManager.getState().activeWindowTitle,
          ...(warning ? { readyStateWarning: warning } : {}),
        },
        summary: `Clicked selector "${selector}" in browser.`,
      })

      return {
        content: [
          textContent(`Clicked selector "${selector}" in frame ${result.targetFrameId} at (${result.targetPoint.x}, ${result.targetPoint.y}).${nudge}`),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          ...result,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_read_input_value'),

    schema: {
      selector: z.string().min(1).describe('CSS selector for the input/select/textarea element'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.readInputValue({
        selector,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`read_input_value for "${selector}"`, results)),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_set_input_value'),

    schema: {
      selector: z.string().min(1).describe('CSS selector for the input/select/textarea element'),
      value: z.string().describe('Value to assign to the matched element'),
      simulateKeystrokes: z.boolean().optional().describe('Whether to emit a per-character key/input chain'),
      blur: z.boolean().optional().describe('Whether to blur the element after setting the value'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, value, simulateKeystrokes, blur, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const { nudge, warning } = await getReadyStateNudge(runtime, tabId, frameIds)
      const results = await runtime.browserDomBridge.setInputValue({
        selector,
        value,
        simulateKeystrokes,
        blur,
        tabId,
        frameIds,
      })

      // Evidence Capture: browser dom set_input_value
      captureUiInteractionEvidence(runtime, {
        source: 'browser_dom_set_input_value',
        actionKind: 'browser_dom_set_input_value',
        subject: selector,
        observed: {
          selector,
          valueLength: value.length,
          appName: runtime.stateManager.getState().activeApp,
          windowTitle: runtime.stateManager.getState().activeWindowTitle,
          ...(warning ? { readyStateWarning: warning } : {}),
        },
        summary: `Set input value for "${selector}" in browser.`,
      })

      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`set_input_value for "${selector}"`, results) + nudge),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          valueLength: value.length,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_check_checkbox'),

    schema: {
      selector: z.string().min(1).describe('CSS selector for the checkbox or radio-like element'),
      checked: z.boolean().optional().describe('Target checked state; omit to toggle'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, checked, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const { nudge, warning } = await getReadyStateNudge(runtime, tabId, frameIds)
      const results = await runtime.browserDomBridge.checkCheckbox({
        selector,
        checked,
        tabId,
        frameIds,
      })

      // Evidence Capture: browser dom check_checkbox
      captureUiInteractionEvidence(runtime, {
        source: 'browser_dom_check_checkbox',
        actionKind: 'browser_dom_check_checkbox',
        subject: selector,
        observed: {
          selector,
          checked: checked ?? 'toggle',
          appName: runtime.stateManager.getState().activeApp,
          windowTitle: runtime.stateManager.getState().activeWindowTitle,
          ...(warning ? { readyStateWarning: warning } : {}),
        },
        summary: `Toggled/Set checkbox "${selector}" in browser.`,
      })

      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`check_checkbox for "${selector}"`, results) + nudge),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          checked,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_select_option'),

    schema: {
      selector: z.string().min(1).describe('CSS selector for the <select> element'),
      value: z.string().min(1).describe('Option value or visible text to select'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, value, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const { nudge, warning } = await getReadyStateNudge(runtime, tabId, frameIds)
      const results = await runtime.browserDomBridge.selectOption({
        selector,
        value,
        tabId,
        frameIds,
      })

      // Evidence Capture: browser dom select_option
      captureUiInteractionEvidence(runtime, {
        source: 'browser_dom_select_option',
        actionKind: 'browser_dom_select_option',
        subject: selector,
        observed: {
          selector,
          selectedValue: value,
          appName: runtime.stateManager.getState().activeApp,
          windowTitle: runtime.stateManager.getState().activeWindowTitle,
          ...(warning ? { readyStateWarning: warning } : {}),
        },
        summary: `Selected option "${value}" for "${selector}" in browser.`,
      })

      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`select_option for "${selector}"`, results) + nudge),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          value,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_wait_for_element'),

    schema: {
      selector: z.string().min(1).describe('CSS selector to wait for'),
      timeoutMs: z.number().int().min(1).max(30_000).optional().describe('How long to wait before timing out'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, timeoutMs, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.waitForElement({
        selector,
        timeoutMs,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`wait_for_element for "${selector}"`, results)),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          timeoutMs: timeoutMs ?? runtime.config.browserDomBridge.requestTimeoutMs,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_get_element_attributes'),

    schema: {
      selector: z.string().min(1).describe('CSS selector for the target element'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.getElementAttributes({
        selector,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`get_element_attributes for "${selector}"`, results)),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_get_computed_styles'),

    schema: {
      selector: z.string().min(1).describe('CSS selector for the target element'),
      properties: z.array(z.string()).min(1).max(32).optional().describe('Optional subset of CSS properties to return'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, properties, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.getComputedStyles({
        selector,
        properties,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`get_computed_styles for "${selector}"`, results)),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('browser_dom_trigger_event'),

    schema: {
      selector: z.string().min(1).describe('CSS selector for the target element'),
      eventName: z.string().min(1).describe('Event name to dispatch, e.g. click, input, change'),
      eventType: z.enum(['Event', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent']).optional().describe('DOM event constructor to use'),
      optsJson: z.string().optional().describe('Optional JSON object merged into the dispatched event init'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },

    handler: async ({ selector, eventName, eventType, optsJson, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      let opts: Record<string, unknown> | undefined
      if (optsJson?.trim()) {
        let parsed: unknown
        try {
          parsed = JSON.parse(optsJson) as unknown
        }
        catch (error) {
          return {
            isError: true,
            content: [
              textContent(`browser_dom_trigger_event expected optsJson to be valid JSON: ${error instanceof Error ? error.message : String(error)}`),
            ],
            structuredContent: {
              status: 'invalid_params',
              field: 'optsJson',
            },
          }
        }

        const record = toBrowserDomRecord(parsed)
        if (!record) {
          return {
            isError: true,
            content: [
              textContent('browser_dom_trigger_event expected optsJson to parse into a JSON object.'),
            ],
          }
        }
        opts = record
      }

      const results = await runtime.browserDomBridge.triggerEvent({
        selector,
        eventName,
        eventType,
        opts,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`trigger_event ${eventName} for "${selector}"`, results)),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          eventName,
          eventType,
          results,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_list_pending_actions'),
    schema: {},

    handler: async () => {
      const pendingActions = runtime.session.listPendingActions()

      return {
        content: [
          textContent(`Pending actions: ${pendingActions.length}`),
        ],
        structuredContent: {
          status: 'ok',
          pendingActions,
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_approve_pending_action'),

    schema: {
      id: z.string().min(1).describe('Pending action id returned by another desktop tool'),
    },

    handler: async ({ id }) => {
      const pending = runtime.session.getPendingAction(id)
      if (!pending) {
        return {
          isError: true,
          content: [
            textContent(`Pending action not found: ${id}`),
          ],
        }
      }

      runtime.session.removePendingAction(id)
      runtime.stateManager.recordApprovalOutcome(false)
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
      await runtime.session.record({
        event: 'approved',
        toolName: 'desktop_approve_pending_action',
        action: pending.action,
        context: pending.context,
        policy: pending.policy,
        result: {
          pendingActionId: id,
        },
      })

      if (pending.action.kind === 'pty_create') {
        const result = await executeApprovedPtyCreate(runtime, pending.action.input)

        await runtime.session.record({
          event: result.isError === true ? 'failed' : 'executed',
          toolName: pending.toolName,
          action: pending.action,
          context: pending.context,
          policy: pending.policy,
          result: {
            pendingActionId: id,
            ...(typeof result.structuredContent === 'object' && result.structuredContent !== null
              ? result.structuredContent as Record<string, unknown>
              : {}),
          },
        })

        return result
      }

      return await executeAction(pending.action, pending.toolName, {
        skipApprovalQueue: true,
      })
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_reject_pending_action'),

    schema: {
      id: z.string().min(1).describe('Pending action id returned by another desktop tool'),
      reason: z.string().optional().describe('Optional rejection note for the audit log'),
    },

    handler: async ({ id, reason }) => {
      const pending = runtime.session.getPendingAction(id)
      if (!pending) {
        return {
          isError: true,
          content: [
            textContent(`Pending action not found: ${id}`),
          ],
        }
      }

      runtime.session.removePendingAction(id)
      runtime.stateManager.recordApprovalOutcome(true, reason)
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
      await runtime.session.record({
        event: 'rejected',
        toolName: 'desktop_reject_pending_action',
        action: pending.action,
        context: pending.context,
        policy: pending.policy,
        result: {
          pendingActionId: id,
          reason,
        },
      })

      return {
        content: [
          textContent(`Pending action rejected: ${id}${reason ? ` (${reason})` : ''}. The strategy layer will suggest an alternative approach.`),
        ],
        structuredContent: {
          status: 'rejected',
          pendingActionId: id,
          reason,
        },
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_get_session_trace'),

    schema: {
      limit: z.number().int().min(1).max(200).optional().describe('How many recent trace entries to return'),
    },

    handler: async ({ limit }) => {
      const trace = runtime.session.getRecentTrace(limit)
      return {
        content: [
          textContent(`Trace entries returned: ${trace.length}`),
        ],
        structuredContent: {
          status: 'ok',
          trace,
        },
      }
    },
  })

  // ---------------------------------------------------------------------------
  // Run-level state tool
  // ---------------------------------------------------------------------------

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_get_state'),
    schema: {},

    handler: async () => {
      await refreshWorkflowRunState()

      const state = runtime.stateManager.getState()
      const summary = summarizeRunState(state)

      return {
        content: [textContent(summary)],
        structuredContent: {
          status: 'ok',
          runState: state,
        },
      }
    },
  })

  // ---------------------------------------------------------------------------
  // Workflow tools — unified outward formatter
  // ---------------------------------------------------------------------------

  function formatWorkflowResult(
    workflowId: string,
    result: import('../workflows').WorkflowExecutionResult,
  ) {
    return {
      content: [textContent(result.summary)],
      structuredContent: formatWorkflowStructuredContent({
        workflowId,
        result,
        runState: runtime.stateManager.getState(),
      }),
    }
  }

  function getCodingGateTerminalEvidence() {
    const state = runtime.stateManager.getState()
    return {
      hasTerminalResult: Boolean(state.lastTerminalResult),
      terminalCommand: state.lastTerminalResult?.command,
      terminalExitCode: state.lastTerminalResult?.exitCode,
    }
  }

  function pickPrimaryReasonCode(reasonCodes: CodingVerificationGateReasonCode[]) {
    return reasonCodes.find(code => code !== 'gate_pass') || reasonCodes[0] || 'gate_pass'
  }

  function recordVerificationNudgeSeed(params: {
    reasonCodes: CodingVerificationGateReasonCode[]
    suggestedValidationCommand?: string
    reviewedFile?: string
    outcome: 'nudged' | 'recheck_required' | 'passed' | 'failed'
    workspacePath?: string
  }) {
    const codingState = runtime.stateManager.getState().coding
    runtime.stateManager.updateCodingState({
      ...(params.workspacePath && !codingState?.workspacePath
        ? { workspacePath: params.workspacePath }
        : {}),
      lastVerificationNudge: {
        reasonCodes: params.reasonCodes,
        suggestedValidationCommand: params.suggestedValidationCommand,
        reviewedFile: params.reviewedFile,
        outcome: params.outcome,
        recordedAt: new Date().toISOString(),
      },
    })
  }

  function recordVerificationOutcomeSeed(params: {
    reasonCodes: CodingVerificationGateReasonCode[]
    suggestedValidationCommand?: string
    reviewedFile?: string
    outcome: 'nudged' | 'recheck_required' | 'passed' | 'failed'
    workspacePath?: string
  }) {
    const codingState = runtime.stateManager.getState().coding
    runtime.stateManager.updateCodingState({
      ...(params.workspacePath && !codingState?.workspacePath
        ? { workspacePath: params.workspacePath }
        : {}),
      lastVerificationOutcome: {
        reasonCodes: params.reasonCodes,
        suggestedValidationCommand: params.suggestedValidationCommand,
        reviewedFile: params.reviewedFile,
        outcome: params.outcome,
        recordedAt: new Date().toISOString(),
      },
    })
  }

  /**
   * Derive and persist operational memory seeds from the current coding state.
   * Called immediately after every `recordVerificationOutcomeSeed` so seeds
   * reflect the final gate decision made in this cycle.
   */
  function recordOperationalMemorySeeds() {
    const codingState = runtime.stateManager.getState().coding
    if (!codingState) {
      return
    }

    const seeds = deriveCodingOperationalMemorySeeds(codingState)
    const summary = summarizeOperationalMemory(seeds)
    runtime.stateManager.updateCodingState({
      operationalMemorySeeds: seeds,
      lastOperationalMemorySummary: summary,
    })
  }

  /**
   * Apply lightweight bias to the upcoming workflow run based on the primary
   * seed from the previous cycle.  This is a hint layer only — it does NOT
   * modify the outward result shape nor directly trigger any action.
   *
   * Two bias paths:
   * 1. `validation_command_mismatch` / `no_validation_run` — escalate the
   *    pre-existing lastVerificationNudge outcome to `recheck_required` so the
   *    gate's recheck path activates even before the first terminal run.
   * 2. `wrong_target` / `missed_dependency` / `patch_verification_mismatch` —
   *    prepend a `[prior_memory:...]` entry to `pendingIssues` so downstream
   *    review and gate evaluation can see the prior lesson.
   */
  function applyOperationalMemoryBias() {
    const codingState = runtime.stateManager.getState().coding
    const primary = pickPrimaryOperationalMemory(codingState?.operationalMemorySeeds ?? [])
    if (!primary) {
      return
    }

    if (primary.reason === 'validation_command_mismatch' || primary.reason === 'no_validation_run') {
      const currentNudge = codingState?.lastVerificationNudge
      if (currentNudge && currentNudge.outcome === 'nudged') {
        runtime.stateManager.updateCodingState({
          lastVerificationNudge: {
            ...currentNudge,
            outcome: 'recheck_required',
          },
        })
      }
    }

    if (
      primary.reason === 'wrong_target'
      || primary.reason === 'missed_dependency'
      || primary.reason === 'patch_verification_mismatch'
    ) {
      const hint = `[prior_memory:${primary.reason}] ${primary.summary}`
      // NOTICE: Strip all stale [prior_memory:] entries before appending so repeated
      // failures on the same reason don't pile up as noise across retries.
      const previousIssues = (codingState?.pendingIssues ?? []).filter(
        issue => !issue.startsWith('[prior_memory:'),
      )
      runtime.stateManager.updateCodingState({
        pendingIssues: [...previousIssues, hint],
      })
    }
  }

  function applyBlockingNudgeToGateDecision(params: {
    gateDecision: ReturnType<typeof evaluateCodingVerificationGate>
    nudge: ReturnType<typeof evaluateCodingVerificationNudge>
    recheckAttempted: boolean
  }): ReturnType<typeof evaluateCodingVerificationGate> {
    const { gateDecision, nudge, recheckAttempted } = params
    if (gateDecision.decision !== 'pass' || nudge.severity !== 'blocking') {
      return gateDecision
    }

    const reasonCode = pickPrimaryReasonCode(nudge.reasonCodes)
    if (!reasonCode || reasonCode === 'gate_pass') {
      return gateDecision
    }

    const canSingleRecheck = !recheckAttempted
      && (reasonCode === 'no_validation_run' || reasonCode === 'validation_command_mismatch')

    if (canSingleRecheck) {
      return {
        ...gateDecision,
        decision: 'recheck_once' as const,
        finalReportStatus: 'in_progress' as const,
        workflowOutcome: 'failed' as const,
        reasonCode,
        explanation: `Blocking verification nudge requires one bounded recheck before completion. ${nudge.message}`,
      }
    }

    return {
      ...gateDecision,
      decision: 'needs_follow_up' as const,
      finalReportStatus: 'failed' as const,
      workflowOutcome: 'failed' as const,
      reasonCode,
      explanation: `Blocking verification nudge prevents completion. ${nudge.message}`,
    }
  }

  function recordPreValidationNudge(params: {
    workflowKind: 'coding_loop' | 'coding_agentic_loop'
    workspacePath: string
    requestedValidationCommand?: string
    reviewedFileHint?: string
  }) {
    const nudge = evaluateCodingVerificationNudge({
      codingState: runtime.stateManager.getState().coding,
      workflowKind: params.workflowKind,
      requestedValidationCommand: params.requestedValidationCommand,
      terminalEvidence: {
        hasTerminalResult: false,
      },
      reviewedFileHint: params.reviewedFileHint,
    })

    recordVerificationNudgeSeed({
      reasonCodes: nudge.reasonCodes,
      suggestedValidationCommand: nudge.suggestedValidationCommand,
      reviewedFile: nudge.reviewedFile,
      outcome: 'nudged',
      workspacePath: params.workspacePath,
    })
  }

  function isBoundedRecheckActionExecuted(result: CallToolResult) {
    if (result.isError === true) {
      return false
    }

    const structured = result.structuredContent as Record<string, unknown> | undefined
    if (!structured || typeof structured.status !== 'string') {
      return true
    }

    return structured.status === 'executed' || structured.status === 'ok'
  }

  function buildGateFailureResult(params: {
    baseResult: import('../workflows').WorkflowExecutionResult
    gateSummary: string
  }): import('../workflows').WorkflowExecutionResult {
    return {
      ...params.baseResult,
      success: false,
      status: 'failed',
      task: {
        ...params.baseResult.task,
        phase: 'failed',
      },
      summary: `${params.baseResult.summary}\n${params.gateSummary}`,
    }
  }

  async function runBoundedCodingVerificationRecheck(params: {
    workflowKind: 'coding_loop' | 'coding_agentic_loop'
    workspacePath: string
    autoApproveSteps: boolean
  }) {
    const codingState = runtime.stateManager.getState().coding
    if (!codingState?.workspacePath) {
      return {
        succeeded: false,
        explanation: 'bounded verification recheck aborted: coding workspace context is unavailable.',
      }
    }

    const currentFilePath = codingState.lastTargetSelection?.selectedFile
    const primitives = new CodingPrimitives(runtime)
    const scopedValidation = await primitives.resolveScopedValidationCommand(currentFilePath)

    const recheckCwd = codingState.validationBaseline?.workspacePath
      || codingState.workspacePath
      || params.workspacePath

    const validationResult = await executeAction({
      kind: 'terminal_exec',
      input: {
        command: scopedValidation.command,
        cwd: recheckCwd,
        timeoutMs: 60_000,
      },
    }, `workflow_${params.workflowKind}_verification_recheck_terminal_exec`, {
      skipApprovalQueue: params.autoApproveSteps,
    })

    if (!isBoundedRecheckActionExecuted(validationResult)) {
      return {
        succeeded: false,
        explanation: 'bounded verification recheck failed while executing scoped validation command.',
      }
    }

    const reviewResult = await executeAction({
      kind: 'coding_review_changes',
      input: currentFilePath ? { currentFilePath } : {},
    }, `workflow_${params.workflowKind}_verification_recheck_review_changes`, {
      skipApprovalQueue: params.autoApproveSteps,
    })

    if (!isBoundedRecheckActionExecuted(reviewResult)) {
      return {
        succeeded: false,
        explanation: 'bounded verification recheck failed while running coding_review_changes.',
      }
    }

    if (params.workflowKind === 'coding_agentic_loop') {
      const diagnosisResult = await executeAction({
        kind: 'coding_diagnose_changes',
        input: currentFilePath ? { currentFilePath } : {},
      }, `workflow_${params.workflowKind}_verification_recheck_diagnose_changes`, {
        skipApprovalQueue: params.autoApproveSteps,
      })

      if (!isBoundedRecheckActionExecuted(diagnosisResult)) {
        return {
          succeeded: false,
          explanation: 'bounded verification recheck failed while running coding_diagnose_changes.',
        }
      }
    }

    return {
      succeeded: true,
      explanation: `bounded verification recheck executed scoped command: ${scopedValidation.command}`,
    }
  }

  async function applyCodingVerificationGate(params: {
    workflowKind: 'coding_loop' | 'coding_agentic_loop'
    workspacePath: string
    autoApproveSteps: boolean
    result: import('../workflows').WorkflowExecutionResult
  }): Promise<import('../workflows').WorkflowExecutionResult> {
    const { result } = params
    if (!result.success || result.status !== 'completed') {
      return result
    }

    const initialNudge = evaluateCodingVerificationNudge({
      codingState: runtime.stateManager.getState().coding,
      workflowKind: params.workflowKind,
      terminalEvidence: getCodingGateTerminalEvidence(),
    })

    recordVerificationNudgeSeed({
      reasonCodes: initialNudge.reasonCodes,
      suggestedValidationCommand: initialNudge.suggestedValidationCommand,
      reviewedFile: initialNudge.reviewedFile,
      outcome: 'nudged',
      workspacePath: params.workspacePath,
    })

    let gateDecision = evaluateCodingVerificationGate({
      codingState: runtime.stateManager.getState().coding,
      workflowKind: params.workflowKind,
      terminalEvidence: getCodingGateTerminalEvidence(),
    })

    gateDecision = applyBlockingNudgeToGateDecision({
      gateDecision,
      nudge: initialNudge,
      recheckAttempted: false,
    })

    if (gateDecision.decision === 'pass') {
      recordVerificationOutcomeSeed({
        reasonCodes: ['gate_pass'],
        suggestedValidationCommand: initialNudge.suggestedValidationCommand,
        reviewedFile: initialNudge.reviewedFile,
        outcome: 'passed',
        workspacePath: params.workspacePath,
      })
      recordOperationalMemorySeeds()
      return result
    }

    if (gateDecision.decision === 'recheck_once') {
      recordVerificationOutcomeSeed({
        reasonCodes: [gateDecision.reasonCode],
        suggestedValidationCommand: initialNudge.suggestedValidationCommand,
        reviewedFile: initialNudge.reviewedFile,
        outcome: 'recheck_required',
        workspacePath: params.workspacePath,
      })

      const recheckOutcome = await runBoundedCodingVerificationRecheck({
        workflowKind: params.workflowKind,
        workspacePath: params.workspacePath,
        autoApproveSteps: params.autoApproveSteps,
      })

      if (!recheckOutcome.succeeded) {
        recordVerificationOutcomeSeed({
          reasonCodes: [gateDecision.reasonCode],
          suggestedValidationCommand: initialNudge.suggestedValidationCommand,
          reviewedFile: initialNudge.reviewedFile,
          outcome: 'failed',
          workspacePath: params.workspacePath,
        })
        recordOperationalMemorySeeds()
        runtime.stateManager.finishTask('failed')
        return buildGateFailureResult({
          baseResult: result,
          gateSummary: `[Verification Gate] ${recheckOutcome.explanation} reason=${gateDecision.reasonCode}`,
        })
      }

      const recheckNudge = evaluateCodingVerificationNudge({
        codingState: runtime.stateManager.getState().coding,
        workflowKind: params.workflowKind,
        terminalEvidence: getCodingGateTerminalEvidence(),
      })

      recordVerificationNudgeSeed({
        reasonCodes: recheckNudge.reasonCodes,
        suggestedValidationCommand: recheckNudge.suggestedValidationCommand,
        reviewedFile: recheckNudge.reviewedFile,
        outcome: 'nudged',
        workspacePath: params.workspacePath,
      })

      gateDecision = evaluateCodingVerificationGate({
        codingState: runtime.stateManager.getState().coding,
        workflowKind: params.workflowKind,
        recheckAttempted: true,
        terminalEvidence: getCodingGateTerminalEvidence(),
      })

      gateDecision = applyBlockingNudgeToGateDecision({
        gateDecision,
        nudge: recheckNudge,
        recheckAttempted: true,
      })

      if (gateDecision.decision === 'pass') {
        recordVerificationOutcomeSeed({
          reasonCodes: ['gate_pass'],
          suggestedValidationCommand: recheckNudge.suggestedValidationCommand,
          reviewedFile: recheckNudge.reviewedFile,
          outcome: 'passed',
          workspacePath: params.workspacePath,
        })
        recordOperationalMemorySeeds()
        return {
          ...result,
          summary: `${result.summary}\n[Verification Gate] single bounded verification recheck passed.`,
        }
      }
    }

    recordVerificationOutcomeSeed({
      reasonCodes: [gateDecision.reasonCode],
      suggestedValidationCommand: runtime.stateManager.getState().coding?.lastScopedValidationCommand?.command,
      reviewedFile: runtime.stateManager.getState().coding?.lastTargetSelection?.selectedFile,
      outcome: 'failed',
      workspacePath: params.workspacePath,
    })
    recordOperationalMemorySeeds()

    runtime.stateManager.finishTask('failed')
    return buildGateFailureResult({
      baseResult: result,
      gateSummary: `[Verification Gate] ${gateDecision.explanation} reason=${gateDecision.reasonCode}`,
    })
  }

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_open_workspace'),

    schema: {
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
      ideApp: z.string().optional().describe('IDE application to open the workspace with (default: Cursor)'),
      fileManagerApp: z.string().optional().describe('File manager to reveal the workspace in (default: Finder)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },

    handler: async ({ projectPath, ideApp, fileManagerApp, autoApprove }) => {
      const workflow = createDevOpenWorkspaceWorkflow({ projectPath, ideApp, fileManagerApp })
      const result = await executeWorkflow({
        workflow,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        overrides: { projectPath },
        autoApproveSteps: autoApprove ?? true,
      })

      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_validate_workspace'),

    schema: {
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
      ideApp: z.string().optional().describe('IDE application to open the workspace with (default: Cursor)'),
      fileManagerApp: z.string().optional().describe('File manager to reveal the workspace in (default: Finder)'),
      changesCommand: z.string().optional().describe('Command to inspect local changes (default: git diff --stat)'),
      checkCommand: z.string().optional().describe('Validation command to run from the workspace root (default: pnpm typecheck)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },

    handler: async ({ projectPath, ideApp, fileManagerApp, changesCommand, checkCommand, autoApprove }) => {
      const workflow = createDevValidateWorkspaceWorkflow({
        projectPath,
        ideApp,
        fileManagerApp,
        changesCommand,
        checkCommand,
      })
      const result = await executeWorkflow({
        workflow,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        overrides: { projectPath },
        autoApproveSteps: autoApprove ?? true,
      })

      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_run_tests'),

    schema: {
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
      testCommand: z.string().optional().describe('Shell command to run tests (default: pnpm test:run)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },

    handler: async ({ projectPath, testCommand, autoApprove }) => {
      const workflow = createDevRunTestsWorkflow({ projectPath, testCommand })
      const result = await executeWorkflow({
        workflow,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        overrides: { projectPath },
        autoApproveSteps: autoApprove ?? true,
      })

      // Store suspension for resume capability.
      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_inspect_failure'),

    schema: {
      ideApp: z.string().optional().describe('IDE application to focus (default: Cursor)'),
      diagnosticCommand: z.string().optional().describe('Optional command to re-run for fresh error output'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },

    handler: async ({ ideApp, diagnosticCommand, autoApprove }) => {
      const workflow = createDevInspectFailureWorkflow({ ideApp, diagnosticCommand })
      const result = await executeWorkflow({
        workflow,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        autoApproveSteps: autoApprove ?? true,
      })

      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_browse_and_act'),

    schema: {
      app: z.string().optional().describe('Application to open (default: Google Chrome)'),
      goal: z.string().optional().describe('Short description of what to accomplish'),
      url: z.string().optional().describe('Optional URL to navigate to in the browser'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },

    handler: async ({ app, goal, url, autoApprove }) => {
      const workflow = createAppBrowseAndActWorkflow({ app, goal, url })
      const result = await executeWorkflow({
        workflow,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        autoApproveSteps: autoApprove ?? true,
      })

      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_coding_loop'),

    schema: {
      workspacePath: z.string().min(1).describe('Absolute path to the workspace root.'),
      taskGoal: z.string().min(1).describe('High-level description of the coding task to accomplish.'),
      targetFile: z.string().min(1).optional().describe('Optional workspace-relative file path to inspect and patch. If omitted, workflow attempts auto-resolution from search output.'),
      searchQuery: z.string().optional().describe('Optional text query to run before patching.'),
      targetSymbol: z.string().optional().describe('Optional symbol name to semantically locate before patching.'),
      targetLine: z.number().int().min(1).optional().describe('Optional 1-based line for reference lookup anchor.'),
      targetColumn: z.number().int().min(1).optional().describe('Optional 1-based column for reference lookup anchor.'),
      allowMultiFile: z.boolean().optional().describe('Allow limited multi-file plan (default: true).'),
      maxPlannedFiles: z.number().int().min(1).max(3).optional().describe('Maximum planned files per cycle (default: 2, max: 3).'),
      patchOld: z.string().min(1).describe('Exact string to replace inside the target file.'),
      patchNew: z.string().describe('Replacement string for the target file patch.'),
      testCommand: z.string().optional().describe('Optional validation command to run after patching (default: auto scoped validation).'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },

    handler: async ({ workspacePath, taskGoal, targetFile, searchQuery, targetSymbol, targetLine, targetColumn, allowMultiFile, maxPlannedFiles, patchOld, patchNew, testCommand, autoApprove }) => {
      if (!targetFile && !searchQuery && !targetSymbol) {
        return {
          isError: true,
          content: [textContent('workflow_coding_loop requires either targetFile or searchQuery/targetSymbol for auto target resolution.')],
          structuredContent: {
            status: 'error',
            reason: 'missing_target_file_and_search_hints',
          },
        }
      }

      recordPreValidationNudge({
        workflowKind: 'coding_loop',
        workspacePath,
        requestedValidationCommand: testCommand ?? 'auto',
        reviewedFileHint: targetFile,
      })
      applyOperationalMemoryBias()

      const workflow = createCodingExecutionLoopWorkflow({
        workspacePath,
        taskGoal,
        targetFile,
        searchQuery,
        targetSymbol,
        targetLine,
        targetColumn,
        allowMultiFile,
        maxPlannedFiles,
        patchOld,
        patchNew,
        testCommand: testCommand ?? 'auto',
      })
      const result = await executeWorkflow({
        workflow,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        autoApproveSteps: autoApprove ?? true,
      })

      const gatedResult = await applyCodingVerificationGate({
        workflowKind: 'coding_loop',
        workspacePath,
        autoApproveSteps: autoApprove ?? true,
        result,
      })

      suspendedWorkflow = gatedResult.suspension

      return formatWorkflowResult(workflow.id, gatedResult)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_coding_agentic_loop'),

    schema: {
      workspacePath: z.string().min(1).describe('Absolute path to the workspace root.'),
      taskGoal: z.string().min(1).describe('High-level description of the coding task to accomplish.'),
      targetFile: z.string().min(1).optional().describe('Optional workspace-relative file path to inspect and patch. If omitted, workflow attempts auto-resolution from search output.'),
      searchQuery: z.string().optional().describe('Optional text query to run before patching.'),
      targetSymbol: z.string().optional().describe('Optional symbol name to semantically locate before patching.'),
      targetLine: z.number().int().min(1).optional().describe('Optional 1-based line for reference lookup anchor.'),
      targetColumn: z.number().int().min(1).optional().describe('Optional 1-based column for reference lookup anchor.'),
      allowMultiFile: z.boolean().optional().describe('Allow limited multi-file plan (default: true).'),
      maxPlannedFiles: z.number().int().min(1).max(3).optional().describe('Maximum planned files per cycle (default: 2, max: 3).'),
      changeIntent: z.enum(['behavior_fix', 'refactor', 'api_change', 'config_change', 'test_fix']).optional().describe('Agentic change intent classification.'),
      patchOld: z.string().min(1).describe('Exact string to replace inside the target file.'),
      patchNew: z.string().describe('Replacement string for the target file patch.'),
      testCommand: z.string().optional().describe('Optional validation command to run after patching (default: auto scoped validation).'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },

    handler: async ({ workspacePath, taskGoal, targetFile, searchQuery, targetSymbol, targetLine, targetColumn, allowMultiFile, maxPlannedFiles, changeIntent, patchOld, patchNew, testCommand, autoApprove }) => {
      if (!targetFile && !searchQuery && !targetSymbol) {
        return {
          isError: true,
          content: [textContent('workflow_coding_agentic_loop requires either targetFile or searchQuery/targetSymbol for auto target resolution.')],
          structuredContent: {
            status: 'error',
            reason: 'missing_target_file_and_search_hints',
          },
        }
      }

      recordPreValidationNudge({
        workflowKind: 'coding_agentic_loop',
        workspacePath,
        requestedValidationCommand: testCommand ?? 'auto',
        reviewedFileHint: targetFile,
      })
      applyOperationalMemoryBias()

      const workflow = createCodingAgenticLoopWorkflow({
        workspacePath,
        taskGoal,
        targetFile,
        searchQuery,
        targetSymbol,
        targetLine,
        targetColumn,
        allowMultiFile,
        maxPlannedFiles,
        changeIntent,
        patchOld,
        patchNew,
        testCommand: testCommand ?? 'auto',
      })
      const result = await executeWorkflow({
        workflow,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        autoApproveSteps: autoApprove ?? true,
      })

      const gatedResult = await applyCodingVerificationGate({
        workflowKind: 'coding_agentic_loop',
        workspacePath,
        autoApproveSteps: autoApprove ?? true,
        result,
      })

      suspendedWorkflow = gatedResult.suspension

      return formatWorkflowResult(workflow.id, gatedResult)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_resume'),

    schema: {
      approved: z.boolean().optional().describe('Whether the pending step was approved (default: true)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for remaining steps (default: true)'),
    },

    handler: async ({ approved, autoApprove }) => {
      if (!suspendedWorkflow) {
        return {
          isError: true,
          content: [textContent('No suspended workflow to resume. Start a workflow first.')],
          structuredContent: { status: 'error', reason: 'no_suspended_workflow' },
        }
      }

      const suspension = suspendedWorkflow
      suspendedWorkflow = undefined

      const result = await resumeWorkflow({
        suspension,
        executeAction,
        executePrepTool,
        acquirePty,
        stateManager: runtime.stateManager,
        refreshState: refreshWorkflowRunState,
        approved: approved ?? true,
        autoApproveSteps: autoApprove ?? true,
      })

      // Store new suspension if workflow pauses again.
      suspendedWorkflow = result.suspension

      return formatWorkflowResult(suspension.workflow.id, result)
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('workflow_switch_lane'),

    schema: {
      sourceLane: z.enum(['coding', 'browser', 'terminal', 'desktop']).describe('The lane currently active (where the switch is being requested from).'),
      targetLane: z.enum(['coding', 'browser', 'terminal', 'desktop']).describe('The lane you want to enter.'),
      reason: z.enum(['validate_visual_state', 'validate_runtime_behavior', 'return_evidence', 'inspect_network', 'observe_console_errors']).describe('Declared reason for the handoff — must be an allowed reason for the route.'),
      constraints: z.array(
        z.object({
          description: z.string().min(1).describe('What must be verified in the target lane.'),
          required: z.boolean().describe('Whether failure to satisfy this constraint blocks the handoff.'),
          expectedValue: z.string().optional().describe('Optional expected value or pattern for automated assertion.'),
        }),
      ).min(1).describe('Verification obligations the target lane must fulfill. At least one is required.'),
    },

    handler: async ({ sourceLane, targetLane, reason, constraints }) => {
      const validation = validateCrossLaneRoute({
        sourceLane: sourceLane as CrossLaneSurface,
        targetLane: targetLane as CrossLaneSurface,
        reason: reason as CrossLaneHandoffReason,
      })

      if (!validation.allowed) {
        return {
          isError: true,
          content: [textContent(`Cross-lane handoff denied: ${validation.reason}`)],
          structuredContent: {
            status: 'denied',
            reason: validation.reason,
            sourceLane,
            targetLane,
            requestedReason: reason,
            allowedRoutes: CROSS_LANE_ALLOWED_ROUTES.map(r => ({
              route: `${r.sourceLane}→${r.targetLane}`,
              allowedReasons: r.allowedReasons,
            })),
          },
        }
      }

      const handoffIsReturn = targetLane === 'coding'
      const activeContract = runtime.stateManager.getState().activeHandoffContract

      const handoffId = (handoffIsReturn && activeContract && activeContract.sourceLane === targetLane)
        ? activeContract.id
        : `handoff_${Date.now()}_${sourceLane}_to_${targetLane}`

      const contract = {
        id: handoffId,
        sourceLane,
        targetLane,
        reason,
        constraints: constraints as CrossLaneConstraint[],
        approvalScope: validation.approvalScope,
        status: 'pending' as const,
        initiatedAt: new Date().toISOString(),
      }

      const constraintSummary = constraints
        .map((c, i) => `${i + 1}. [${c.required ? 'required' : 'optional'}] ${c.description}${c.expectedValue ? ` (expected: ${c.expectedValue})` : ''}`)
        .join('\n')

      // Evidence Capture: handoff status
      const evidenceSummary = handoffIsReturn
        ? `Handoff return: ${sourceLane} -> ${targetLane}. Evidence captured before return.`
        : `Handoff initiated: ${sourceLane} -> ${targetLane}. Expected constraints: ${constraints.length}`

      captureHandoffEvidence(runtime, {
        source: handoffIsReturn ? 'workflow_switch_lane_return' : 'workflow_switch_lane_initiation',
        handoffId,
        sourceLane,
        targetLane,
        reason,
        summary: evidenceSummary,
        constraints: constraints as CrossLaneConstraint[],
        observation: handoffIsReturn
          ? {
              foregroundApp: runtime.stateManager.getState().activeApp,
              windowTitle: runtime.stateManager.getState().activeWindowTitle,
            }
          : undefined,
      })

      // If returning, check if we transitioned and fulfilled a contract
      const newState = runtime.stateManager.getState()
      const resolvedContract = newState.handoffHistory.find(h => h.id === handoffId)

      let fulfillmentAdvice = ''
      if (resolvedContract) {
        const statusText = resolvedContract.status.toUpperCase()
        const failureText = resolvedContract.failureReason ? ` - ${resolvedContract.failureReason}` : ''
        const repairText = (resolvedContract.repairHint && resolvedContract.repairHint !== 'none')
          ? `\n[REPAIR SUGGESTED] Action: ${resolvedContract.repairHint}. Please attempt this recovery step before proceeding.`
          : ''
        fulfillmentAdvice = `\n\nVerification Contract Result: ${statusText}${failureText}${repairText}`
      }

      return {
        content: [
          textContent(
            `Cross-lane handoff initiated: ${sourceLane} → ${targetLane} (reason: ${reason}).\n\nVerification constraints that must be fulfilled in target lane:\n${constraintSummary}\n\nHandoff ID: ${handoffId}${fulfillmentAdvice}`,
          ),
        ],
        structuredContent: {
          status: handoffIsReturn ? 'handoff_resolved' : 'handoff_initiated',
          contract: handoffIsReturn ? resolvedContract : contract,
        },
      }
    },
  })
}
