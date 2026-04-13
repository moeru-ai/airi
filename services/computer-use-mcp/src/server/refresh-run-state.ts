import type { ComputerUseServerRuntime } from './runtime'

import { buildBrowserSurfaceAvailability } from './browser-surface'

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
