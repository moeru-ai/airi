import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

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

import { getRuntimePreflight } from '../preflight'
import { summarizeRunState } from '../transparency'
import {
  createAppBrowseAndActWorkflow,
  createDevInspectFailureWorkflow,
  createDevOpenWorkspaceWorkflow,
  createDevRunTestsWorkflow,
  createDevValidateWorkspaceWorkflow,
  executeWorkflow,
  resumeWorkflow,
} from '../workflows'
import { getBrowserAgentLaunchContext, runBrowserAgentTask } from './browser-agent'
import { textContent } from './content'
import {
  describeExecutionTarget,
  describeForegroundContext,
  summarizeCoordinateSpace,
} from './formatters'
import { refreshRuntimeRunState } from './refresh-run-state'
import { createAcquirePtyCallback, executeApprovedPtyCreate } from './register-pty'
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

export function registerComputerUseTools(params: RegisterComputerUseToolsOptions) {
  const { server, runtime, executeAction, enableTestTools } = params
  const executePrepTool = createWorkflowPrepToolExecutor(runtime)
  const acquirePty = createAcquirePtyCallback(runtime)

  async function refreshWorkflowRunState() {
    await refreshRuntimeRunState(runtime)
  }

  // Workflow suspension state — stored in this closure so that
  // workflow_resume and the approve handler can access it.
  let suspendedWorkflow: WorkflowSuspension | undefined

  server.tool(
    'desktop_get_capabilities',
    {},
    async () => {
      const [{ executionTarget, context, displayInfo, browserSurfaceAvailability }, permissionInfo] = await Promise.all([
        refreshRuntimeRunState(runtime),
        runtime.executor.getPermissionInfo(),
      ])
      const snapshot = runtime.session.getSnapshot()
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
          session: snapshot,
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
          browserAgent: getBrowserAgentLaunchContext(),
          browserDomBridge: runtime.browserDomBridge.getStatus(),
          browserSurfaceAvailability,
        },
      }
    },
  )

  if (enableTestTools && runtime.executor.openTestTarget) {
    server.tool(
      'desktop_open_test_target',
      {},
      async () => {
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
    )
  }

  server.tool(
    'desktop_observe_windows',
    {
      limit: z.number().int().min(1).max(32).optional().describe('Maximum number of visible windows to return'),
      app: z.string().optional().describe('Optional app-name substring filter'),
    },
    async input => executeAction({ kind: 'observe_windows', input }, 'desktop_observe_windows'),
  )

  server.tool(
    'desktop_screenshot',
    {
      label: z.string().optional().describe('Optional label for the saved screenshot file'),
    },
    async ({ label }) => executeAction({ kind: 'screenshot', input: { label } }, 'desktop_screenshot'),
  )

  server.tool(
    'desktop_open_app',
    {
      app: z.string().min(1).describe('Application name from COMPUTER_USE_OPENABLE_APPS'),
    },
    async (input: OpenAppActionInput) => executeAction({ kind: 'open_app', input }, 'desktop_open_app'),
  )

  server.tool(
    'desktop_focus_app',
    {
      app: z.string().min(1).describe('Application name from COMPUTER_USE_OPENABLE_APPS'),
    },
    async (input: FocusAppActionInput) => executeAction({ kind: 'focus_app', input }, 'desktop_focus_app'),
  )

  server.tool(
    'desktop_click',
    {
      x: z.number().describe('Absolute screen X coordinate in pixels'),
      y: z.number().describe('Absolute screen Y coordinate in pixels'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button, default left'),
      clickCount: z.number().int().min(1).max(2).optional().describe('Number of clicks, default 1'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },
    async (input: ClickActionInput) => executeAction({ kind: 'click', input }, 'desktop_click'),
  )

  server.tool(
    'desktop_type_text',
    {
      text: z.string().min(1).describe('Text to type into the focused UI element'),
      x: z.number().optional().describe('Optional X coordinate to click before typing'),
      y: z.number().optional().describe('Optional Y coordinate to click before typing'),
      pressEnter: z.boolean().optional().describe('Whether to press Enter after typing'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },
    async (input: TypeTextActionInput) => executeAction({ kind: 'type_text', input }, 'desktop_type_text'),
  )

  server.tool(
    'desktop_press_keys',
    {
      keys: z.array(z.string()).min(1).describe('Single key chord, e.g. ["ctrl", "l"]'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },
    async input => executeAction({ kind: 'press_keys', input }, 'desktop_press_keys'),
  )

  server.tool(
    'desktop_scroll',
    {
      x: z.number().optional().describe('Optional X coordinate to move to before scrolling'),
      y: z.number().optional().describe('Optional Y coordinate to move to before scrolling'),
      deltaX: z.number().optional().describe('Horizontal scroll delta in pixels'),
      deltaY: z.number().describe('Vertical scroll delta in pixels'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
    },
    async input => executeAction({ kind: 'scroll', input }, 'desktop_scroll'),
  )

  server.tool(
    'desktop_wait',
    {
      durationMs: z.number().int().min(0).max(30_000).describe('Wait time in milliseconds'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the wait'),
    },
    async input => executeAction({ kind: 'wait', input }, 'desktop_wait'),
  )

  server.tool(
    'terminal_exec',
    {
      command: z.string().min(1).describe('Shell command to execute in the local background runner'),
      cwd: z.string().optional().describe('Optional working directory override'),
      timeoutMs: z.number().int().min(1).max(120_000).optional().describe('Optional timeout override in milliseconds'),
    },
    async (input: TerminalExecActionInput) => executeAction({ kind: 'terminal_exec', input }, 'terminal_exec'),
  )

  server.tool(
    'terminal_get_state',
    {},
    async () => {
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
  )

  server.tool(
    'terminal_reset_state',
    {
      reason: z.string().optional().describe('Optional reset note for the audit log'),
    },
    async input => executeAction({ kind: 'terminal_reset', input }, 'terminal_reset_state'),
  )

  server.tool(
    'secret_read_env_value',
    {
      filePath: z.string().min(1).describe('Absolute or explicit env file path to inspect, for example /Users/liuziheng/airi/.env'),
      keys: z.array(z.string().min(1)).min(1).max(16).describe('Candidate env variable names to try in order, e.g. ["AIRI_E2E_DISCORD_TOKEN", "DISCORD_BOT_TOKEN"]'),
      allowPlaceholder: z.boolean().optional().describe('Whether to allow obvious placeholder/template values such as replace-with-your-token'),
    },
    async (input: SecretReadEnvValueActionInput) => executeAction({ kind: 'secret_read_env_value', input }, 'secret_read_env_value'),
  )

  server.tool(
    'clipboard_read_text',
    {
      maxLength: z.number().int().min(1).max(32_768).optional().describe('Optional maximum number of characters to return from the clipboard'),
      trim: z.boolean().optional().describe('Whether to trim leading/trailing whitespace before returning the text (default: true)'),
    },
    async input => executeAction({ kind: 'clipboard_read_text', input }, 'clipboard_read_text'),
  )

  server.tool(
    'clipboard_write_text',
    {
      text: z.string().describe('Text to place into the system clipboard'),
    },
    async input => executeAction({ kind: 'clipboard_write_text', input }, 'clipboard_write_text'),
  )

  server.tool(
    'browser_dom_get_bridge_status',
    {},
    async () => {
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
  )

  server.tool(
    'browser_agent_get_status',
    {},
    async () => {
      const launchContext = getBrowserAgentLaunchContext()
      return {
        content: [
          textContent(`Browser agent root ${launchContext.rootExists ? 'ready' : 'missing'} at ${launchContext.cliCwd}; python=${launchContext.pythonCommand}; cdp=${launchContext.cdpUrl}.`),
        ],
        structuredContent: {
          status: launchContext.rootExists ? 'ok' : 'missing',
          browserAgent: launchContext,
        },
      }
    },
  )

  server.tool(
    'browser_agent_run',
    {
      instruction: z.string().min(1).describe('Goal-driven browser instruction for the autonomous browser agent.'),
      agent: z.enum(['google', 'kimi']).optional().describe('Browser agent backend to use (default: google).'),
      cdpUrl: z.string().optional().describe('Optional Chrome CDP endpoint override, e.g. http://localhost:9222'),
      maxTurns: z.number().int().min(1).max(80).optional().describe('Maximum browser-agent reasoning turns (default: 30).'),
      timeoutMs: z.number().int().min(1_000).max(900_000).optional().describe('End-to-end timeout for the delegated browser task (default: 180000).'),
    },
    async ({ instruction, agent, cdpUrl, maxTurns, timeoutMs }) => {
      const launchContext = getBrowserAgentLaunchContext({ cdpUrl })

      if (!launchContext.rootExists) {
        return {
          isError: true,
          content: [
            textContent(`Browser agent root is missing: ${launchContext.cliCwd}.`),
          ],
          structuredContent: {
            status: 'missing',
            browserAgent: launchContext,
          },
        }
      }

      try {
        const result = await runBrowserAgentTask({
          instruction,
          agent,
          cdpUrl,
          maxTurns,
          timeoutMs,
        })

        return {
          content: [
            textContent(`Browser agent ${result.success ? 'completed' : 'stopped'} on ${result.payload?.url || result.cdpUrl}.`),
          ],
          structuredContent: {
            status: result.success ? 'completed' : 'failed',
            browserAgent: {
              instruction: result.instruction,
              agent: result.agent,
              cdpUrl: result.cdpUrl,
              cliCwd: result.cliCwd,
              cliModule: result.cliModule,
              pythonCommand: result.pythonCommand,
              exitCode: result.exitCode,
              timedOut: result.timedOut,
              stderrLines: result.stderrLines,
            },
            payload: result.payload,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`Browser agent failed: ${error instanceof Error ? error.message : String(error)}`),
          ],
          structuredContent: {
            status: 'error',
            browserAgent: launchContext,
            error: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  )

  server.tool(
    'browser_dom_get_active_tab',
    {},
    async () => {
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
  )

  server.tool(
    'browser_dom_read_page',
    {
      includeText: z.boolean().optional().describe('Whether to include truncated body text for each frame'),
      maxElements: z.number().int().min(1).max(500).optional().describe('Maximum interactive elements per frame to collect'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ includeText, maxElements, tabId, frameIds }) => {
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
  )

  server.tool(
    'browser_dom_find_elements',
    {
      selector: z.string().min(1).describe('CSS selector to query in the active tab frames'),
      maxResults: z.number().int().min(1).max(50).optional().describe('Maximum matched elements to include per frame'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, maxResults, tabId, frameIds }) => {
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
  )

  server.tool(
    'browser_dom_click',
    {
      selector: z.string().min(1).describe('CSS selector to click via the browser extension bridge'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const result = await runtime.browserDomBridge.clickSelector({
        selector,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(`Clicked selector "${selector}" in frame ${result.targetFrameId} at (${result.targetPoint.x}, ${result.targetPoint.y}).`),
        ],
        structuredContent: {
          status: 'ok',
          selector,
          ...result,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  )

  server.tool(
    'browser_dom_read_input_value',
    {
      selector: z.string().min(1).describe('CSS selector for the input/select/textarea element'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, tabId, frameIds }) => {
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
  )

  server.tool(
    'browser_dom_set_input_value',
    {
      selector: z.string().min(1).describe('CSS selector for the input/select/textarea element'),
      value: z.string().describe('Value to assign to the matched element'),
      simulateKeystrokes: z.boolean().optional().describe('Whether to emit a per-character key/input chain'),
      blur: z.boolean().optional().describe('Whether to blur the element after setting the value'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, value, simulateKeystrokes, blur, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.setInputValue({
        selector,
        value,
        simulateKeystrokes,
        blur,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`set_input_value for "${selector}"`, results)),
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
  )

  server.tool(
    'browser_dom_check_checkbox',
    {
      selector: z.string().min(1).describe('CSS selector for the checkbox or radio-like element'),
      checked: z.boolean().optional().describe('Target checked state; omit to toggle'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, checked, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.checkCheckbox({
        selector,
        checked,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`check_checkbox for "${selector}"`, results)),
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
  )

  server.tool(
    'browser_dom_select_option',
    {
      selector: z.string().min(1).describe('CSS selector for the <select> element'),
      value: z.string().min(1).describe('Option value or visible text to select'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, value, tabId, frameIds }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.selectOption({
        selector,
        value,
        tabId,
        frameIds,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`select_option for "${selector}"`, results)),
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
  )

  server.tool(
    'browser_dom_wait_for_element',
    {
      selector: z.string().min(1).describe('CSS selector to wait for'),
      timeoutMs: z.number().int().min(1).max(30_000).optional().describe('How long to wait before timing out'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, timeoutMs, tabId, frameIds }) => {
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
  )

  server.tool(
    'browser_dom_get_element_attributes',
    {
      selector: z.string().min(1).describe('CSS selector for the target element'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, tabId, frameIds }) => {
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
  )

  server.tool(
    'browser_dom_get_computed_styles',
    {
      selector: z.string().min(1).describe('CSS selector for the target element'),
      properties: z.array(z.string()).min(1).max(32).optional().describe('Optional subset of CSS properties to return'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, properties, tabId, frameIds }) => {
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
  )

  server.tool(
    'browser_dom_trigger_event',
    {
      selector: z.string().min(1).describe('CSS selector for the target element'),
      eventName: z.string().min(1).describe('Event name to dispatch, e.g. click, input, change'),
      eventType: z.enum(['Event', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent']).optional().describe('DOM event constructor to use'),
      optsJson: z.string().optional().describe('Optional JSON object merged into the dispatched event init'),
      tabId: optionalTabIdSchema,
      frameIds: optionalFrameIdsSchema,
    },
    async ({ selector, eventName, eventType, optsJson, tabId, frameIds }) => {
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
  )

  server.tool(
    'desktop_list_pending_actions',
    {},
    async () => {
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
  )

  server.tool(
    'desktop_approve_pending_action',
    {
      id: z.string().min(1).describe('Pending action id returned by another desktop tool'),
    },
    async ({ id }) => {
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
  )

  server.tool(
    'desktop_reject_pending_action',
    {
      id: z.string().min(1).describe('Pending action id returned by another desktop tool'),
      reason: z.string().optional().describe('Optional rejection note for the audit log'),
    },
    async ({ id, reason }) => {
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
  )

  server.tool(
    'desktop_get_session_trace',
    {
      limit: z.number().int().min(1).max(200).optional().describe('How many recent trace entries to return'),
    },
    async ({ limit }) => {
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
  )

  // ---------------------------------------------------------------------------
  // Run-level state tool
  // ---------------------------------------------------------------------------

  server.tool(
    'desktop_get_state',
    {},
    async () => {
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
  )

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

  server.tool(
    'workflow_open_workspace',
    {
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
      ideApp: z.string().optional().describe('IDE application to open the workspace with (default: Cursor)'),
      fileManagerApp: z.string().optional().describe('File manager to reveal the workspace in (default: Finder)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },
    async ({ projectPath, ideApp, fileManagerApp, autoApprove }) => {
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
  )

  server.tool(
    'workflow_validate_workspace',
    {
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
      ideApp: z.string().optional().describe('IDE application to open the workspace with (default: Cursor)'),
      fileManagerApp: z.string().optional().describe('File manager to reveal the workspace in (default: Finder)'),
      changesCommand: z.string().optional().describe('Command to inspect local changes (default: git diff --stat)'),
      checkCommand: z.string().optional().describe('Validation command to run from the workspace root (default: pnpm typecheck)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },
    async ({ projectPath, ideApp, fileManagerApp, changesCommand, checkCommand, autoApprove }) => {
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
  )

  server.tool(
    'workflow_run_tests',
    {
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
      testCommand: z.string().optional().describe('Shell command to run tests (default: pnpm test:run)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },
    async ({ projectPath, testCommand, autoApprove }) => {
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
  )

  server.tool(
    'workflow_inspect_failure',
    {
      ideApp: z.string().optional().describe('IDE application to focus (default: Cursor)'),
      diagnosticCommand: z.string().optional().describe('Optional command to re-run for fresh error output'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },
    async ({ ideApp, diagnosticCommand, autoApprove }) => {
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
  )

  server.tool(
    'workflow_browse_and_act',
    {
      app: z.string().optional().describe('Application to open (default: Google Chrome)'),
      goal: z.string().optional().describe('Short description of what to accomplish'),
      url: z.string().optional().describe('Optional URL to navigate to in the browser'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
    },
    async ({ app, goal, url, autoApprove }) => {
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
  )

  server.tool(
    'workflow_resume',
    {
      approved: z.boolean().optional().describe('Whether the pending step was approved (default: true)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for remaining steps (default: true)'),
    },
    async ({ approved, autoApprove }) => {
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
  )
}
