import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type {
  ClickActionInput,
  FocusAppActionInput,
  OpenAppActionInput,
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
  createDevRunTestsWorkflow,
  executeWorkflow,
  resumeWorkflow,
} from '../workflows'
import { textContent } from './content'
import {
  describeExecutionTarget,
  describeForegroundContext,
  summarizeCoordinateSpace,
} from './formatters'

export interface RegisterComputerUseToolsOptions {
  server: McpServer
  runtime: ComputerUseServerRuntime
  executeAction: ExecuteAction
  enableTestTools: boolean
}

export function registerComputerUseTools(params: RegisterComputerUseToolsOptions) {
  const { server, runtime, executeAction, enableTestTools } = params

  // Workflow suspension state — stored in this closure so that
  // workflow_resume and the approve handler can access it.
  let suspendedWorkflow: WorkflowSuspension | undefined

  server.tool(
    'desktop_get_capabilities',
    {},
    async () => {
      const [executionTarget, context, displayInfo, permissionInfo] = await Promise.all([
        runtime.executor.getExecutionTarget(),
        runtime.executor.getForegroundContext(),
        runtime.executor.getDisplayInfo(),
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
      // Refresh foreground context before returning state.
      const [context, executionTarget, displayInfo] = await Promise.all([
        runtime.executor.getForegroundContext(),
        runtime.executor.getExecutionTarget(),
        runtime.executor.getDisplayInfo(),
      ])
      runtime.stateManager.updateForegroundContext(context)
      runtime.stateManager.updateExecutionTarget(executionTarget)
      runtime.stateManager.updateDisplayInfo(displayInfo)
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
      runtime.stateManager.updateTerminalState(runtime.terminalRunner.getState())

      const lastScreenshot = runtime.session.getLastScreenshot()
      if (lastScreenshot) {
        runtime.stateManager.updateLastScreenshot(lastScreenshot)
      }

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
  // Workflow tools
  // ---------------------------------------------------------------------------

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
        stateManager: runtime.stateManager,
        overrides: { projectPath },
        autoApproveSteps: autoApprove ?? true,
      })

      // Store suspension for resume capability.
      suspendedWorkflow = result.suspension

      return {
        content: [textContent(result.summary)],
        structuredContent: {
          status: result.suspension ? 'paused' : result.success ? 'completed' : 'failed',
          workflow: workflow.id,
          task: result.task,
          stepResults: result.stepResults.map(r => ({
            label: r.step.label,
            succeeded: r.succeeded,
            explanation: r.explanation,
          })),
          ...(result.suspension
            ? {
                resumeHint: 'Call workflow_resume after approving the pending action to continue.',
                pausedAtStep: result.suspension.pausedAtStepIndex,
              }
            : {}),
        },
      }
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
        stateManager: runtime.stateManager,
        autoApproveSteps: autoApprove ?? true,
      })

      suspendedWorkflow = result.suspension

      return {
        content: [textContent(result.summary)],
        structuredContent: {
          status: result.suspension ? 'paused' : result.success ? 'completed' : 'failed',
          workflow: workflow.id,
          task: result.task,
          stepResults: result.stepResults.map(r => ({
            label: r.step.label,
            succeeded: r.succeeded,
            explanation: r.explanation,
          })),
          ...(result.suspension
            ? {
                resumeHint: 'Call workflow_resume after approving the pending action to continue.',
                pausedAtStep: result.suspension.pausedAtStepIndex,
              }
            : {}),
        },
      }
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
        stateManager: runtime.stateManager,
        autoApproveSteps: autoApprove ?? true,
      })

      suspendedWorkflow = result.suspension

      return {
        content: [textContent(result.summary)],
        structuredContent: {
          status: result.suspension ? 'paused' : result.success ? 'completed' : 'failed',
          workflow: workflow.id,
          task: result.task,
          stepResults: result.stepResults.map(r => ({
            label: r.step.label,
            succeeded: r.succeeded,
            explanation: r.explanation,
          })),
          ...(result.suspension
            ? {
                resumeHint: 'Call workflow_resume after approving the pending action to continue.',
                pausedAtStep: result.suspension.pausedAtStepIndex,
              }
            : {}),
        },
      }
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
        stateManager: runtime.stateManager,
        approved: approved ?? true,
        autoApproveSteps: autoApprove ?? true,
      })

      // Store new suspension if workflow pauses again.
      suspendedWorkflow = result.suspension

      return {
        content: [textContent(result.summary)],
        structuredContent: {
          status: result.suspension ? 'paused' : result.success ? 'completed' : 'failed',
          workflow: suspension.workflow.id,
          task: result.task,
          stepResults: result.stepResults.map(r => ({
            label: r.step.label,
            succeeded: r.succeeded,
            explanation: r.explanation,
          })),
          ...(result.suspension
            ? {
                resumeHint: 'Call workflow_resume after approving the pending action to continue.',
                pausedAtStep: result.suspension.pausedAtStepIndex,
              }
            : {}),
        },
      }
    },
  )
}
