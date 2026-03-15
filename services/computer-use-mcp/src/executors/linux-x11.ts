import type { RemoteRunnerClientOptions } from '../runner/client'
import type {
  ClickActionInput,
  ComputerUseConfig,
  DesktopExecutor,
  ForegroundContext,
  PointerTracePoint,
  PressKeysActionInput,
  ScrollActionInput,
  TypeTextActionInput,
  WaitActionInput,
  WindowObservation,
} from '../types'

import { RemoteRunnerClient } from '../runner/client'
import { writeScreenshotArtifact } from '../utils/screenshot'

// NOTICE: `linux-x11` is a legacy remote desktop executor kept for compatibility
// with the old SSH-bound X11 runner flow. The current product mainline is
// `macos-local` plus terminal/browser/IDE surfaces. Avoid expanding this path
// with new capabilities; prefer migrating follow-up work to the newer surfaces.
export interface LinuxX11ExecutorOptions extends RemoteRunnerClientOptions {
  client?: RemoteRunnerClient
}

function unavailableContext(reason: string): ForegroundContext {
  return {
    available: false,
    platform: 'linux',
    unavailableReason: reason,
  }
}

/**
 * @deprecated Legacy SSH/X11 executor. Keep only for compatibility with the
 * remote runner path; do not treat it as a first-class surface for new work.
 */
export function createLinuxX11Executor(config: ComputerUseConfig, options: LinuxX11ExecutorOptions = {}): DesktopExecutor {
  const client = options.client || new RemoteRunnerClient(config, options)

  return {
    kind: 'linux-x11',
    describe: () => ({
      kind: 'linux-x11',
      notes: [
        'deprecated legacy remote executor',
        'approval, trace and audit stay on the host',
        'all desktop actions execute through a remote SSH-bound X11 runner',
      ],
    }),
    getExecutionTarget: () => client.getExecutionTarget(),
    getForegroundContext: async () => {
      try {
        return await client.getForegroundContext()
      }
      catch (error) {
        return unavailableContext(error instanceof Error ? error.message : String(error))
      }
    },
    getDisplayInfo: () => client.getDisplayInfo(),
    getPermissionInfo: () => client.getPermissionInfo(),
    observeWindows: async () => {
      const context = await client.getForegroundContext()
      const windows = context.available && context.appName
        ? [{
            id: `${context.appName}:${context.windowTitle || 'foreground'}`,
            appName: context.appName,
            title: context.windowTitle,
          }]
        : []
      return {
        frontmostAppName: context.appName,
        frontmostWindowTitle: context.windowTitle,
        windows,
        observedAt: new Date().toISOString(),
      } satisfies WindowObservation
    },
    takeScreenshot: async (request) => {
      const result = await client.takeScreenshot(request)

      return await writeScreenshotArtifact({
        label: request.label,
        screenshotsDir: config.screenshotsDir,
        dataBase64: result.dataBase64,
        publicUrl: result.publicUrl,
        note: result.note,
        executionTarget: result.executionTarget,
      })
    },
    openApp: async () => {
      throw new Error('linux-x11 executor does not implement app.open in this v1')
    },
    focusApp: async () => {
      throw new Error('linux-x11 executor does not implement app.focus in this v1')
    },
    click: async (input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => await client.click(input),
    typeText: async (input: TypeTextActionInput) => await client.typeText(input),
    pressKeys: async (input: PressKeysActionInput) => await client.pressKeys(input),
    scroll: async (input: ScrollActionInput) => await client.scroll(input),
    wait: async (input: WaitActionInput) => await client.wait(input),
    openTestTarget: async () => await client.openTestTarget(),
    close: async () => {
      await client.close()
    },
  }
}
