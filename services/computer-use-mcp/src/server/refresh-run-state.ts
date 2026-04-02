/**
 * DEPRECATED: Internal helper for refresh logic.
 *
 * This file is now superseded by runtime-coordinator.ts.
 * Use `createRuntimeCoordinator(runtime).refreshSnapshot(reason)` instead.
 *
 * This export is kept temporarily for backward compatibility during migration.
 * Direct callers should migrate to the coordinator interface.
 */

import type { ComputerUseServerRuntime } from './runtime'

import { buildBrowserSurfaceAvailability } from './browser-surface'

/**
 * @deprecated Use `createRuntimeCoordinator(runtime).refreshSnapshot(reason)` instead.
 * This function will be removed after all call sites are migrated.
 */
export async function refreshRuntimeRunState(runtime: ComputerUseServerRuntime) {
  const [executionTarget, context, displayInfo, cdpAvailability] = await Promise.all([
    runtime.executor.getExecutionTarget(),
    runtime.executor.getForegroundContext(),
    runtime.executor.getDisplayInfo(),
    runtime.cdpBridgeManager.probeAvailability(),
  ])

  runtime.stateManager.updateForegroundContext(context)
  runtime.stateManager.updateExecutionTarget(executionTarget)
  runtime.stateManager.updateDisplayInfo(displayInfo)
  runtime.stateManager.updateTerminalState(runtime.terminalRunner.getState())
  runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

  const browserSurfaceAvailability = buildBrowserSurfaceAvailability({
    executionTarget,
    extension: runtime.browserDomBridge.getStatus(),
    cdp: cdpAvailability,
  })
  runtime.stateManager.updateBrowserSurfaceAvailability(browserSurfaceAvailability)
  runtime.stateManager.refreshCodingRoundContext()

  const lastScreenshot = runtime.session.getLastScreenshot()
  if (lastScreenshot) {
    runtime.stateManager.updateLastScreenshot(lastScreenshot)
  }

  return {
    executionTarget,
    context,
    displayInfo,
    cdpAvailability,
    browserSurfaceAvailability,
  }
}
