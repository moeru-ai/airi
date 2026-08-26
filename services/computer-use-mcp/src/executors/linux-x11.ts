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
import { errorMessageFromValue } from '../utils/error-message'
import { writeScreenshotArtifact } from '../utils/screenshot'

export interface LinuxX11ExecutorOptions extends RemoteRunnerClientOptions {
  client?: RemoteRunnerClient
}

export function createLinuxX11Executor(config: ComputerUseConfig, options: LinuxX11ExecutorOptions = {}): DesktopExecutor {
  const client = options.client || new RemoteRunnerClient(config, options)

  return {
    click: async (input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => await client.click(input),
    close: async () => {
      await client.close()
    },
    describe: () => ({
      kind: 'linux-x11',
      notes: [
        'approval, trace and audit stay on the host',
        'all desktop actions execute through a remote SSH-bound X11 runner',
      ],
    }),
    focusApp: async () => {
      throw new Error('linux-x11 executor does not implement app.focus in this v1')
    },
    getDisplayInfo: () => client.getDisplayInfo(),
    getExecutionTarget: () => client.getExecutionTarget(),
    getForegroundContext: async () => {
      try {
        return await client.getForegroundContext()
      }
      catch (error) {
        return unavailableContext(errorMessageFromValue(error))
      }
    },
    getPermissionInfo: () => client.getPermissionInfo(),
    kind: 'linux-x11',
    observeWindows: async () => {
      const context = await client.getForegroundContext()
      const windows = context.available && context.appName
        ? [{
            appName: context.appName,
            id: `${context.appName}:${context.windowTitle || 'foreground'}`,
            title: context.windowTitle,
          }]
        : []
      return {
        frontmostAppName: context.appName,
        frontmostWindowTitle: context.windowTitle,
        observedAt: new Date().toISOString(),
        windows,
      } satisfies WindowObservation
    },
    openApp: async () => {
      throw new Error('linux-x11 executor does not implement app.open in this v1')
    },
    openTestTarget: async () => await client.openTestTarget(),
    pressKeys: async (input: PressKeysActionInput) => await client.pressKeys(input),
    scroll: async (input: ScrollActionInput) => await client.scroll(input),
    takeScreenshot: async (request) => {
      const result = await client.takeScreenshot(request)

      return await writeScreenshotArtifact({
        dataBase64: result.dataBase64,
        executionTarget: result.executionTarget,
        label: request.label,
        note: result.note,
        publicUrl: result.publicUrl,
        screenshotsDir: config.screenshotsDir,
      })
    },
    typeText: async (input: TypeTextActionInput) => await client.typeText(input),
    wait: async (input: WaitActionInput) => await client.wait(input),
  }
}

function unavailableContext(reason: string): ForegroundContext {
  return {
    available: false,
    platform: 'linux',
    unavailableReason: reason,
  }
}
