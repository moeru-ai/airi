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

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { diagnoseBrowserActionError } from '../browser-dom/browser-repair-contract'
import { getUnsupportedBrowserDomActions, isBrowserDomActionSupported } from '../browser-dom/capabilities'
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
import { executeChromeEnsure } from './register-chrome-session'
import { createAcquirePtyCallback, executeApprovedPtyCreate } from './register-pty'
import { createToolLaneHygieneServer } from './tool-lane-hygiene'
import { formatWorkflowStructuredContent } from './workflow-formatter'
import { createWorkflowPrepToolExecutor } from './workflow-prep-tools'

export interface RegisterComputerUseToolsOptions {
  enableTestTools: boolean
  executeAction: ExecuteAction
  runtime: ComputerUseServerRuntime
  server: McpServer
}

const optionalTabIdSchema = z.number().int().min(0).optional().describe('Optional browser tab id override; defaults to the active tab')
const optionalFrameIdsSchema = z.array(z.number().int().min(0)).min(1).optional().describe('Optional frame ids to target; omit to let the bridge inspect all frames')

export function registerComputerUseTools(params: RegisterComputerUseToolsOptions) {
  const { enableTestTools, executeAction, runtime } = params
  const server = createToolLaneHygieneServer(params.server, runtime.stateManager)
  const executePrepTool = createWorkflowPrepToolExecutor(runtime)
  const acquirePty = createAcquirePtyCallback(runtime)

  async function refreshWorkflowRunState() {
    await refreshRuntimeRunState(runtime)
  }

  // Workflow suspension state — stored in this closure so that
  // workflow_resume and the approve handler can access it.
  let suspendedWorkflow: undefined | WorkflowSuspension

  server.tool(
    'desktop_get_capabilities',
    {},
    async () => {
      const [{ browserSurfaceAvailability, context, displayInfo, executionTarget }, permissionInfo] = await Promise.all([
        refreshRuntimeRunState(runtime),
        runtime.executor.getPermissionInfo(),
      ])
      const snapshot = runtime.session.getSnapshot()
      const preflight = getRuntimePreflight({
        config: runtime.config,
        displayInfo,
        executionTarget,
        lastScreenshot: runtime.session.getLastScreenshot(),
      })

      return {
        content: [
          textContent(
            `Executor=${runtime.config.executor}, host=${preflight.launchContext.hostName}, target=${describeExecutionTarget(executionTarget)}, sessionTag=${preflight.launchContext.sessionTag || 'missing'}, coordinateSpace=${summarizeCoordinateSpace(preflight.coordinateSpace)}. Foreground=${describeForegroundContext(context)}.`,
          ),
        ],
        structuredContent: {
          appPolicy: 'deny-only',
          approvalUx: 'electron-dialog',
          browserAgent: getBrowserAgentLaunchContext(),
          browserDomBridge: runtime.browserDomBridge.getStatus(),
          browserSurfaceAvailability,
          coordinateSpace: preflight.coordinateSpace,
          coordScope: 'global-screen',
          displayInfo,
          executionTarget,
          executor: runtime.executor.describe(),
          foregroundContext: context,
          launchContext: preflight.launchContext,
          mutationGuards: {
            applies: runtime.config.executor !== 'dry-run',
            blockingIssues: preflight.mutationReadinessIssues,
            readyForMutations: preflight.mutationReadinessIssues.length === 0,
            requireAllowedBoundsForMutatingActions: runtime.config.requireAllowedBoundsForMutatingActions,
            requireCoordinateAlignmentForMutatingActions: runtime.config.requireCoordinateAlignmentForMutatingActions,
            requireSessionTagForMutatingActions: runtime.config.requireSessionTagForMutatingActions,
          },
          permissions: permissionInfo,
          policy: {
            allowApps: runtime.config.allowApps,
            allowedBounds: runtime.config.allowedBounds,
            approvalMode: runtime.config.approvalMode,
            defaultCaptureAfter: runtime.config.defaultCaptureAfter,
            denyApps: runtime.config.denyApps,
            denyWindowTitles: runtime.config.denyWindowTitles,
            maxOperations: runtime.config.maxOperations,
            maxOperationUnits: runtime.config.maxOperationUnits,
            openableApps: runtime.config.openableApps,
          },
          session: snapshot,
          supportedAppsForOpenFocus: runtime.config.openableApps,
          terminalBackend: runtime.terminalRunner.describe().kind,
          windowAutomation: runtime.config.executor === 'macos-local'
            ? 'NSWorkspace + CGWindowList + Quartz'
            : runtime.config.executor === 'linux-x11'
              ? 'remote X11 runner'
              : 'dry-run',
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
            appName: result.appName,
            executionTarget: result.executionTarget,
            recommendedClickPoint: result.recommendedClickPoint,
            status: 'executed',
            windowTitle: result.windowTitle,
          },
        }
      },
    )
  }

  server.tool(
    'desktop_observe_windows',
    {
      app: z.string().optional().describe('Optional app-name substring filter'),
      limit: z.number().int().min(1).max(32).optional().describe('Maximum number of visible windows to return'),
    },
    async input => executeAction({ input, kind: 'observe_windows' }, 'desktop_observe_windows'),
  )

  server.tool(
    'desktop_screenshot',
    {
      label: z.string().optional().describe('Optional label for the saved screenshot file'),
    },
    async ({ label }) => executeAction({ input: { label }, kind: 'screenshot' }, 'desktop_screenshot'),
  )

  server.tool(
    'desktop_open_app',
    {
      app: z.string().min(1).describe('Application name from COMPUTER_USE_OPENABLE_APPS'),
    },
    async (input: OpenAppActionInput) => executeAction({ input, kind: 'open_app' }, 'desktop_open_app'),
  )

  server.tool(
    'desktop_focus_app',
    {
      app: z.string().min(1).describe('Application name from COMPUTER_USE_OPENABLE_APPS'),
    },
    async (input: FocusAppActionInput) => executeAction({ input, kind: 'focus_app' }, 'desktop_focus_app'),
  )

  server.tool(
    'desktop_click',
    {
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button, default left'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
      clickCount: z.number().int().min(1).max(2).optional().describe('Number of clicks, default 1'),
      x: z.number().describe('Global logical screen X coordinate, not Retina backing pixels'),
      y: z.number().describe('Global logical screen Y coordinate, not Retina backing pixels'),
    },
    async (input: ClickActionInput) => executeAction({ input, kind: 'click' }, 'desktop_click'),
  )

  server.tool(
    'desktop_type_text',
    {
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
      pressEnter: z.boolean().optional().describe('Whether to press Enter after typing'),
      text: z.string().min(1).describe('Text to type into the focused UI element'),
      x: z.number().optional().describe('Optional global logical screen X coordinate to click before typing'),
      y: z.number().optional().describe('Optional global logical screen Y coordinate to click before typing'),
    },
    async (input: TypeTextActionInput) => executeAction({ input, kind: 'type_text' }, 'desktop_type_text'),
  )

  server.tool(
    'desktop_press_keys',
    {
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
      keys: z.array(z.string()).min(1).describe('Single key chord, e.g. ["ctrl", "l"]'),
    },
    async input => executeAction({ input, kind: 'press_keys' }, 'desktop_press_keys'),
  )

  server.tool(
    'desktop_scroll',
    {
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action'),
      deltaX: z.number().optional().describe('Horizontal scroll delta in pixels'),
      deltaY: z.number().describe('Vertical scroll delta in pixels'),
      x: z.number().optional().describe('Optional global logical screen X coordinate to move to before scrolling'),
      y: z.number().optional().describe('Optional global logical screen Y coordinate to move to before scrolling'),
    },
    async input => executeAction({ input, kind: 'scroll' }, 'desktop_scroll'),
  )

  server.tool(
    'desktop_wait',
    {
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the wait'),
      durationMs: z.number().int().min(0).max(30_000).describe('Wait time in milliseconds'),
    },
    async input => executeAction({ input, kind: 'wait' }, 'desktop_wait'),
  )

  server.tool(
    'terminal_exec',
    {
      command: z.string().min(1).describe('Shell command to execute in the local background runner'),
      cwd: z.string().optional().describe('Optional working directory override'),
      timeoutMs: z.number().int().min(1).max(120_000).optional().describe('Optional timeout override in milliseconds'),
    },
    async (input: TerminalExecActionInput) => executeAction({ input, kind: 'terminal_exec' }, 'terminal_exec'),
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
    async input => executeAction({ input, kind: 'terminal_reset' }, 'terminal_reset_state'),
  )

  server.tool(
    'secret_read_env_value',
    {
      allowPlaceholder: z.boolean().optional().describe('Whether to allow obvious placeholder/template values such as replace-with-your-token'),
      filePath: z.string().min(1).describe('Absolute or explicit env file path to inspect, for example /Users/example-user/airi/.env'),
      keys: z.array(z.string().min(1)).min(1).max(16).describe('Candidate env variable names to try in order, e.g. ["AIRI_E2E_DISCORD_TOKEN", "DISCORD_BOT_TOKEN"]'),
    },
    async (input: SecretReadEnvValueActionInput) => executeAction({ input, kind: 'secret_read_env_value' }, 'secret_read_env_value'),
  )

  server.tool(
    'clipboard_read_text',
    {
      maxLength: z.number().int().min(1).max(32_768).optional().describe('Optional maximum number of characters to return from the clipboard'),
      trim: z.boolean().optional().describe('Whether to trim leading/trailing whitespace before returning the text (default: true)'),
    },
    async input => executeAction({ input, kind: 'clipboard_read_text' }, 'clipboard_read_text'),
  )

  server.tool(
    'clipboard_write_text',
    {
      text: z.string().describe('Text to place into the system clipboard'),
    },
    async input => executeAction({ input, kind: 'clipboard_write_text' }, 'clipboard_write_text'),
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
          bridge,
          status: 'ok',
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
          browserAgent: launchContext,
          status: launchContext.rootExists ? 'ok' : 'missing',
        },
      }
    },
  )

  server.tool(
    'browser_agent_run',
    {
      agent: z.enum(['google', 'kimi']).optional().describe('Browser agent backend to use (default: google).'),
      cdpUrl: z.string().optional().describe('Optional Chrome CDP endpoint override, e.g. http://localhost:9222'),
      instruction: z.string().min(1).describe('Goal-driven browser instruction for the autonomous browser agent.'),
      maxTurns: z.number().int().min(1).max(80).optional().describe('Maximum browser-agent reasoning turns (default: 30).'),
      timeoutMs: z.number().int().min(1_000).max(900_000).optional().describe('End-to-end timeout for the delegated browser task (default: 180000).'),
    },
    async ({ agent, cdpUrl, instruction, maxTurns, timeoutMs }) => {
      const launchContext = getBrowserAgentLaunchContext({ cdpUrl })

      if (!launchContext.rootExists) {
        return {
          content: [
            textContent(`Browser agent root is missing: ${launchContext.cliCwd}.`),
          ],
          isError: true,
          structuredContent: {
            browserAgent: launchContext,
            status: 'missing',
          },
        }
      }

      try {
        const result = await runBrowserAgentTask({
          agent,
          cdpUrl,
          instruction,
          maxTurns,
          timeoutMs,
        })

        return {
          content: [
            textContent(`Browser agent ${result.success ? 'completed' : 'stopped'} on ${result.payload?.url || result.cdpUrl}.`),
          ],
          structuredContent: {
            browserAgent: {
              agent: result.agent,
              cdpUrl: result.cdpUrl,
              cliCwd: result.cliCwd,
              cliModule: result.cliModule,
              exitCode: result.exitCode,
              instruction: result.instruction,
              pythonCommand: result.pythonCommand,
              stderrLines: result.stderrLines,
              timedOut: result.timedOut,
            },
            payload: result.payload,
            status: result.success ? 'completed' : 'failed',
          },
        }
      }
      catch (error) {
        const message = errorMessageFrom(error) ?? 'unknown error'
        return {
          content: [
            textContent(`Browser agent failed: ${message}`),
          ],
          isError: true,
          structuredContent: {
            browserAgent: launchContext,
            error: message,
            status: 'error',
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
          activeTab,
          bridge: runtime.browserDomBridge.getStatus(),
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_dom_read_page',
    {
      frameIds: optionalFrameIdsSchema,
      includeText: z.boolean().optional().describe('Whether to include truncated body text for each frame'),
      maxElements: z.number().int().min(1).max(500).optional().describe('Maximum interactive elements per frame to collect'),
      tabId: optionalTabIdSchema,
    },
    async ({ frameIds, includeText, maxElements, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const frames = await runtime.browserDomBridge.readAllFramesDom({
        frameIds,
        includeText,
        maxElements,
        tabId,
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
          bridge: runtime.browserDomBridge.getStatus(),
          frames,
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_dom_find_elements',
    {
      frameIds: optionalFrameIdsSchema,
      maxResults: z.number().int().min(1).max(50).optional().describe('Maximum matched elements to include per frame'),
      selector: z.string().min(1).describe('CSS selector to query in the active tab frames'),
      tabId: optionalTabIdSchema,
    },
    async ({ frameIds, maxResults, selector, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.findElements({
        frameIds,
        maxResults,
        selector,
        tabId,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`find_elements for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          results,
          selector,
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_dom_click',
    {
      frameIds: optionalFrameIdsSchema,
      selector: z.string().min(1).describe('CSS selector to click via the browser extension bridge'),
      tabId: optionalTabIdSchema,
    },
    async ({ frameIds, selector, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['getClickTarget', 'clickAt']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      let result: Awaited<ReturnType<typeof runtime.browserDomBridge.clickSelector>>
      try {
        result = await runtime.browserDomBridge.clickSelector({
          frameIds,
          selector,
          tabId,
        })
      }
      catch (error) {
        return buildBrowserDomActionErrorResponse({
          actionKind: 'browser_dom_click',
          error,
          runtime,
          selector,
        })
      }

      // NOTICE: clickSelector resolves even when the clickAt step misses
      // (e.g. reflow between target lookup and click dispatch). Inspect
      // per-frame results before reporting success.
      const clickFrames = result?.clickResults
      const anyClickSucceeded = Array.isArray(clickFrames) && clickFrames.some(
        fr => (fr.result as Record<string, unknown>)?.success === true,
      )
      if (!anyClickSucceeded) {
        return {
          content: [
            textContent(`browser_dom_click: clicked at (${result.targetPoint.x}, ${result.targetPoint.y}) in frame ${result.targetFrameId} but no frame reported a successful DOM click for "${selector}".`),
          ],
          isError: true,
          structuredContent: {
            selector,
            status: 'click_miss',
            ...result,
            bridge: runtime.browserDomBridge.getStatus(),
          },
        }
      }

      return {
        content: [
          textContent(`Clicked selector "${selector}" in frame ${result.targetFrameId} at (${result.targetPoint.x}, ${result.targetPoint.y}).`),
        ],
        structuredContent: {
          selector,
          status: 'ok',
          ...result,
          bridge: runtime.browserDomBridge.getStatus(),
        },
      }
    },
  )

  server.tool(
    'browser_dom_read_input_value',
    {
      frameIds: optionalFrameIdsSchema,
      selector: z.string().min(1).describe('CSS selector for the input/select/textarea element'),
      tabId: optionalTabIdSchema,
    },
    async ({ frameIds, selector, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['readInputValue']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      const results = await runtime.browserDomBridge.readInputValue({
        frameIds,
        selector,
        tabId,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`read_input_value for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          results,
          selector,
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_dom_set_input_value',
    {
      blur: z.boolean().optional().describe('Whether to blur the element after setting the value'),
      frameIds: optionalFrameIdsSchema,
      selector: z.string().min(1).describe('CSS selector for the input/select/textarea element'),
      simulateKeystrokes: z.boolean().optional().describe('Whether to emit a per-character key/input chain'),
      tabId: optionalTabIdSchema,
      value: z.string().describe('Value to assign to the matched element'),
    },
    async ({ blur, frameIds, selector, simulateKeystrokes, tabId, value }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['setInputValue']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      const results = await runtime.browserDomBridge.setInputValue({
        blur,
        frameIds,
        selector,
        simulateKeystrokes,
        tabId,
        value,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`set_input_value for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          results,
          selector,
          status: 'ok',
          valueLength: value.length,
        },
      }
    },
  )

  server.tool(
    'browser_dom_check_checkbox',
    {
      checked: z.boolean().optional().describe('Target checked state; omit to toggle'),
      frameIds: optionalFrameIdsSchema,
      selector: z.string().min(1).describe('CSS selector for the checkbox or radio-like element'),
      tabId: optionalTabIdSchema,
    },
    async ({ checked, frameIds, selector, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['checkCheckbox']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      const results = await runtime.browserDomBridge.checkCheckbox({
        checked,
        frameIds,
        selector,
        tabId,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`check_checkbox for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          checked,
          results,
          selector,
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_dom_select_option',
    {
      frameIds: optionalFrameIdsSchema,
      selector: z.string().min(1).describe('CSS selector for the <select> element'),
      tabId: optionalTabIdSchema,
      value: z.string().min(1).describe('Option value or visible text to select'),
    },
    async ({ frameIds, selector, tabId, value }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['selectOption']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      const results = await runtime.browserDomBridge.selectOption({
        frameIds,
        selector,
        tabId,
        value,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`select_option for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          results,
          selector,
          status: 'ok',
          value,
        },
      }
    },
  )

  server.tool(
    'browser_dom_wait_for_element',
    {
      frameIds: optionalFrameIdsSchema,
      selector: z.string().min(1).describe('CSS selector to wait for'),
      tabId: optionalTabIdSchema,
      timeoutMs: z.number().int().min(1).max(30_000).optional().describe('How long to wait before timing out'),
    },
    async ({ frameIds, selector, tabId, timeoutMs }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['waitForElement']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      let results: Awaited<ReturnType<typeof runtime.browserDomBridge.waitForElement>>
      try {
        results = await runtime.browserDomBridge.waitForElement({
          frameIds,
          selector,
          tabId,
          timeoutMs,
        })
      }
      catch (error) {
        return buildBrowserDomActionErrorResponse({
          actionKind: 'browser_dom_wait_for_element',
          error,
          runtime,
          selector,
        })
      }
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`wait_for_element for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          results,
          selector,
          status: 'ok',
          timeoutMs: timeoutMs ?? runtime.config.browserDomBridge.requestTimeoutMs,
        },
      }
    },
  )

  server.tool(
    'browser_dom_get_element_attributes',
    {
      frameIds: optionalFrameIdsSchema,
      selector: z.string().min(1).describe('CSS selector for the target element'),
      tabId: optionalTabIdSchema,
    },
    async ({ frameIds, selector, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)

      const results = await runtime.browserDomBridge.getElementAttributes({
        frameIds,
        selector,
        tabId,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`get_element_attributes for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          results,
          selector,
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_dom_get_computed_styles',
    {
      frameIds: optionalFrameIdsSchema,
      properties: z.array(z.string()).min(1).max(32).optional().describe('Optional subset of CSS properties to return'),
      selector: z.string().min(1).describe('CSS selector for the target element'),
      tabId: optionalTabIdSchema,
    },
    async ({ frameIds, properties, selector, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['getComputedStyles']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      const results = await runtime.browserDomBridge.getComputedStyles({
        frameIds,
        properties,
        selector,
        tabId,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`get_computed_styles for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          results,
          selector,
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_dom_trigger_event',
    {
      eventName: z.string().min(1).describe('Event name to dispatch, e.g. click, input, change'),
      eventType: z.enum(['Event', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent']).optional().describe('DOM event constructor to use'),
      frameIds: optionalFrameIdsSchema,
      optsJson: z.string().optional().describe('Optional JSON object merged into the dispatched event init'),
      selector: z.string().min(1).describe('CSS selector for the target element'),
      tabId: optionalTabIdSchema,
    },
    async ({ eventName, eventType, frameIds, optsJson, selector, tabId }) => {
      if (!runtime.browserDomBridge.getStatus().connected)
        return buildBrowserDomUnavailableResponse(runtime)
      const requiredActions = ['triggerEvent']
      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions))
        return buildBrowserDomUnavailableResponse(runtime, getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions))

      let opts: Record<string, unknown> | undefined
      if (optsJson?.trim()) {
        let parsed: unknown
        try {
          parsed = JSON.parse(optsJson) as unknown
        }
        catch (error) {
          const message = errorMessageFrom(error) ?? 'unknown error'
          return {
            content: [
              textContent(`browser_dom_trigger_event expected optsJson to be valid JSON: ${message}`),
            ],
            isError: true,
            structuredContent: {
              field: 'optsJson',
              status: 'invalid_params',
            },
          }
        }

        const record = toBrowserDomRecord(parsed)
        if (!record) {
          return {
            content: [
              textContent('browser_dom_trigger_event expected optsJson to parse into a JSON object.'),
            ],
            isError: true,
          }
        }
        opts = record
      }

      const results = await runtime.browserDomBridge.triggerEvent({
        eventName,
        eventType,
        frameIds,
        opts,
        selector,
        tabId,
      })
      return {
        content: [
          textContent(summarizeBrowserDomFrameResults(`trigger_event ${eventName} for "${selector}"`, results)),
        ],
        structuredContent: {
          bridge: runtime.browserDomBridge.getStatus(),
          eventName,
          eventType,
          results,
          selector,
          status: 'ok',
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
          pendingActions,
          status: 'ok',
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
          content: [
            textContent(`Pending action not found: ${id}`),
          ],
          isError: true,
        }
      }

      runtime.session.removePendingAction(id)
      runtime.stateManager.recordApprovalOutcome(false)
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
      await runtime.session.record({
        action: pending.action,
        context: pending.context,
        event: 'approved',
        policy: pending.policy,
        result: {
          pendingActionId: id,
        },
        toolName: 'desktop_approve_pending_action',
      })

      if (pending.action.kind === 'pty_create') {
        const result = await executeApprovedPtyCreate(runtime, pending.action.input)

        await runtime.session.record({
          action: pending.action,
          context: pending.context,
          event: result.isError === true ? 'failed' : 'executed',
          policy: pending.policy,
          result: {
            pendingActionId: id,
            ...(typeof result.structuredContent === 'object' && result.structuredContent !== null
              ? result.structuredContent as Record<string, unknown>
              : {}),
          },
          toolName: pending.toolName,
        })

        return result
      }

      if (pending.action.kind === 'desktop_ensure_chrome') {
        const result = await executeChromeEnsure(
          runtime,
          pending.action.input,
          pending.policy.estimatedOperationUnits,
        )

        await runtime.session.record({
          action: pending.action,
          context: pending.context,
          event: result.isError === true ? 'failed' : 'executed',
          policy: pending.policy,
          result: {
            pendingActionId: id,
            ...(typeof result.structuredContent === 'object' && result.structuredContent !== null
              ? result.structuredContent as Record<string, unknown>
              : {}),
          },
          toolName: pending.toolName,
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
          content: [
            textContent(`Pending action not found: ${id}`),
          ],
          isError: true,
        }
      }

      runtime.session.removePendingAction(id)
      runtime.stateManager.recordApprovalOutcome(true, reason)
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
      await runtime.session.record({
        action: pending.action,
        context: pending.context,
        event: 'rejected',
        policy: pending.policy,
        result: {
          pendingActionId: id,
          reason,
        },
        toolName: 'desktop_reject_pending_action',
      })

      return {
        content: [
          textContent(`Pending action rejected: ${id}${reason ? ` (${reason})` : ''}. The strategy layer will suggest an alternative approach.`),
        ],
        structuredContent: {
          pendingActionId: id,
          reason,
          status: 'rejected',
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
          runState: state,
          status: 'ok',
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
        result,
        runState: runtime.stateManager.getState(),
        workflowId,
      }),
    }
  }

  server.tool(
    'workflow_open_workspace',
    {
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
      fileManagerApp: z.string().optional().describe('File manager to reveal the workspace in (default: Finder)'),
      ideApp: z.string().optional().describe('IDE application to open the workspace with (default: Cursor)'),
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
    },
    async ({ autoApprove, fileManagerApp, ideApp, projectPath }) => {
      const workflow = createDevOpenWorkspaceWorkflow({ fileManagerApp, ideApp, projectPath })
      const result = await executeWorkflow({
        acquirePty,
        autoApproveSteps: autoApprove ?? true,
        executeAction,
        executePrepTool,
        overrides: { projectPath },
        refreshState: refreshWorkflowRunState,
        stateManager: runtime.stateManager,
        workflow,
      })

      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  )

  server.tool(
    'workflow_validate_workspace',
    {
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
      changesCommand: z.string().optional().describe('Command to inspect local changes (default: git diff --stat)'),
      checkCommand: z.string().optional().describe('Validation command to run from the workspace root (default: pnpm typecheck)'),
      fileManagerApp: z.string().optional().describe('File manager to reveal the workspace in (default: Finder)'),
      ideApp: z.string().optional().describe('IDE application to open the workspace with (default: Cursor)'),
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
    },
    async ({ autoApprove, changesCommand, checkCommand, fileManagerApp, ideApp, projectPath }) => {
      const workflow = createDevValidateWorkspaceWorkflow({
        changesCommand,
        checkCommand,
        fileManagerApp,
        ideApp,
        projectPath,
      })
      const result = await executeWorkflow({
        acquirePty,
        autoApproveSteps: autoApprove ?? true,
        executeAction,
        executePrepTool,
        overrides: { projectPath },
        refreshState: refreshWorkflowRunState,
        stateManager: runtime.stateManager,
        workflow,
      })

      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  )

  server.tool(
    'workflow_run_tests',
    {
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
      projectPath: z.string().min(1).describe('Absolute path to the project directory'),
      testCommand: z.string().optional().describe('Shell command to run tests (default: pnpm test:run)'),
    },
    async ({ autoApprove, projectPath, testCommand }) => {
      const workflow = createDevRunTestsWorkflow({ projectPath, testCommand })
      const result = await executeWorkflow({
        acquirePty,
        autoApproveSteps: autoApprove ?? true,
        executeAction,
        executePrepTool,
        overrides: { projectPath },
        refreshState: refreshWorkflowRunState,
        stateManager: runtime.stateManager,
        workflow,
      })

      // Store suspension for resume capability.
      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  )

  server.tool(
    'workflow_inspect_failure',
    {
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
      diagnosticCommand: z.string().optional().describe('Optional command to re-run for fresh error output'),
      ideApp: z.string().optional().describe('IDE application to focus (default: Cursor)'),
    },
    async ({ autoApprove, diagnosticCommand, ideApp }) => {
      const workflow = createDevInspectFailureWorkflow({ diagnosticCommand, ideApp })
      const result = await executeWorkflow({
        acquirePty,
        autoApproveSteps: autoApprove ?? true,
        executeAction,
        executePrepTool,
        refreshState: refreshWorkflowRunState,
        stateManager: runtime.stateManager,
        workflow,
      })

      suspendedWorkflow = result.suspension

      return formatWorkflowResult(workflow.id, result)
    },
  )

  server.tool(
    'workflow_browse_and_act',
    {
      app: z.string().optional().describe('Application to open (default: Google Chrome)'),
      autoApprove: z.boolean().optional().describe('Skip per-step approval for workflow actions (default: true)'),
      goal: z.string().optional().describe('Short description of what to accomplish'),
      url: z.string().optional().describe('Optional URL to navigate to in the browser'),
    },
    async ({ app, autoApprove, goal, url }) => {
      const workflow = createAppBrowseAndActWorkflow({ app, goal, url })
      const result = await executeWorkflow({
        acquirePty,
        autoApproveSteps: autoApprove ?? true,
        executeAction,
        executePrepTool,
        refreshState: refreshWorkflowRunState,
        stateManager: runtime.stateManager,
        workflow,
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
          content: [textContent('No suspended workflow to resume. Start a workflow first.')],
          isError: true,
          structuredContent: { reason: 'no_suspended_workflow', status: 'error' },
        }
      }

      const suspension = suspendedWorkflow
      suspendedWorkflow = undefined

      const result = await resumeWorkflow({
        acquirePty,
        approved: approved ?? true,
        autoApproveSteps: autoApprove ?? true,
        executeAction,
        executePrepTool,
        refreshState: refreshWorkflowRunState,
        stateManager: runtime.stateManager,
        suspension,
      })

      // Store new suspension if workflow pauses again.
      suspendedWorkflow = result.suspension

      return formatWorkflowResult(suspension.workflow.id, result)
    },
  )
}

function buildBrowserDomActionErrorResponse(params: {
  actionKind: string
  error: unknown
  runtime: ComputerUseServerRuntime
  selector: string
}) {
  const { actionKind, error, runtime, selector } = params
  const message = errorMessageFrom(error) ?? 'unknown error'
  const repairSuggestion = diagnoseBrowserActionError(error, selector, actionKind)

  return {
    content: [
      textContent(
        repairSuggestion
          ? `${actionKind} failed for "${selector}": ${message}\n\n${repairSuggestion.reactionText}`
          : `${actionKind} failed for "${selector}": ${message}`,
      ),
    ],
    isError: true,
    structuredContent: {
      actionKind,
      bridge: runtime.browserDomBridge.getStatus(),
      error: message,
      repairSuggestion: repairSuggestion ?? undefined,
      selector,
      status: 'error',
    },
  }
}

function buildBrowserDomUnavailableResponse(runtime: ComputerUseServerRuntime, unsupportedActions?: string[]) {
  const status = runtime.browserDomBridge.getStatus()
  const detail = unsupportedActions?.length
    ? `connected extension transport does not support ${unsupportedActions.join(', ')}`
    : status.lastError || 'the browser extension is not connected yet'
  return {
    content: [
      textContent(`Browser DOM bridge is unavailable: ${detail}.`),
    ],
    isError: true,
    structuredContent: {
      bridge: status,
      status: 'unavailable',
      unsupportedActions,
    },
  }
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
