import type { ComputerUseServerRuntime } from './runtime'

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

  const browserSurfaceAvailability = {
    executionMode: executionTarget.mode,
    suitable: false,
    availableSurfaces: [] as never[],
    reason: 'Deferred to Chunk 3 (browser/devtools/demo).',
    extension: {
      enabled: runtime.browserDomBridge.getStatus().enabled,
      connected: false,
      lastError: runtime.browserDomBridge.getStatus().lastError,
    },
    cdp: {
      endpoint: cdpAvailability.endpoint,
      connected: cdpAvailability.connected,
      connectable: cdpAvailability.connectable,
      lastError: cdpAvailability.lastError,
    },
  }
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
