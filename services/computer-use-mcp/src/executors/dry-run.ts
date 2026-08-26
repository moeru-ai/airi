import type {
  ClickActionInput,
  ComputerUseConfig,
  DesktopExecutor,
  ExecutionTarget,
  ExecutorActionResult,
  FocusAppActionInput,
  ForegroundContext,
  ObserveWindowsRequest,
  OpenAppActionInput,
  PointerTracePoint,
  PressKeysActionInput,
  ScrollActionInput,
  TypeTextActionInput,
  WaitActionInput,
  WindowObservation,
} from '../types'

import { hostname } from 'node:os'
import { platform } from 'node:process'

import { probeDisplayInfo, probePermissionInfo } from '../runtime-probes'
import { captureScreenshotArtifact } from '../utils/screenshot'

export function createDryRunExecutor(config: ComputerUseConfig): DesktopExecutor {
  const executionTarget = getDryRunExecutionTarget(config)

  return {
    click: async (_input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => result(['dry-run: click not injected'], executionTarget),
    describe: () => ({
      kind: 'dry-run',
      notes: [
        'desktop input is not injected',
        'screenshots are still attempted on the current host for debugging',
      ],
    }),
    focusApp: async (_input: FocusAppActionInput) => result(['dry-run: app not focused'], executionTarget),
    getDisplayInfo: () => probeDisplayInfo(config),
    getExecutionTarget: async () => executionTarget,
    getForegroundContext: getBestEffortForegroundContext,
    getPermissionInfo: () => probePermissionInfo(config),
    kind: 'dry-run',
    observeWindows: async request => observeWindows(request),
    openApp: async (_input: OpenAppActionInput) => result(['dry-run: app not opened'], executionTarget),
    openTestTarget: async () => ({
      appName: 'dry-run-target',
      executionTarget,
      launched: true,
      recommendedClickPoint: {
        x: 180,
        y: 150,
      },
      windowTitle: 'Dry Run Desktop Target',
    }),
    pressKeys: async (_input: PressKeysActionInput) => result(['dry-run: shortcut not injected'], executionTarget),
    scroll: async (_input: ScrollActionInput) => result(['dry-run: scroll not injected'], executionTarget),
    takeScreenshot: request => captureScreenshotArtifact({
      executionTarget,
      label: request.label,
      screenshotBinary: config.binaries.screencapture,
      screenshotsDir: config.screenshotsDir,
      timeoutMs: config.timeoutMs,
    }),
    typeText: async (_input: TypeTextActionInput) => result(['dry-run: text not injected'], executionTarget),
    wait: async (input: WaitActionInput) => {
      await new Promise(resolve => setTimeout(resolve, Math.max(input.durationMs, 0)))
      return {
        backend: 'dry-run',
        executionTarget,
        notes: ['dry-run: waited without desktop mutation'],
        performed: true,
      }
    },
  }
}

async function getBestEffortForegroundContext(): Promise<ForegroundContext> {
  return {
    available: false,
    platform,
    unavailableReason: 'dry-run backend does not inspect foreground window state',
  }
}

function getDryRunExecutionTarget(config: ComputerUseConfig): ExecutionTarget {
  return {
    hostName: hostname(),
    isolated: false,
    mode: 'dry-run',
    note: 'dry-run mode never injects desktop input',
    sessionTag: config.sessionTag,
    tainted: false,
    transport: 'local',
  }
}

function observeWindows(request: ObserveWindowsRequest): WindowObservation {
  return {
    frontmostAppName: request.app,
    observedAt: new Date().toISOString(),
    windows: [],
  }
}

function result(notes: string[], executionTarget: ExecutionTarget): ExecutorActionResult {
  return {
    backend: 'dry-run',
    executionTarget,
    notes,
    performed: false,
  }
}
