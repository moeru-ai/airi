import type {
  ClickActionInput,
  ComputerUseConfig,
  DesktopExecutor,
  ExecutionTarget,
  ExecutorActionResult,
  FocusAppActionInput,
  FocusWindowActionInput,
  ForegroundContext,
  ObserveWindowsRequest,
  OpenAppActionInput,
  PointerTracePoint,
  PressKeysActionInput,
  ScrollActionInput,
  SetWindowBoundsActionInput,
  TypeTextActionInput,
  WaitActionInput,
  WindowObservation,
} from '../types'

import { hostname } from 'node:os'
import { platform } from 'node:process'

import { probeDisplayInfo, probePermissionInfo } from '../runtime-probes'
import { captureScreenshotArtifact } from '../utils/screenshot'

async function getBestEffortForegroundContext(): Promise<ForegroundContext> {
  return {
    available: false,
    platform,
    unavailableReason: 'dry-run backend does not inspect foreground window state',
  }
}

function result(notes: string[], executionTarget: ExecutionTarget): ExecutorActionResult {
  return {
    performed: false,
    backend: 'dry-run',
    notes,
    executionTarget,
  }
}

function getDryRunExecutionTarget(config: ComputerUseConfig): ExecutionTarget {
  return {
    mode: 'dry-run',
    transport: 'local',
    hostName: hostname(),
    sessionTag: config.sessionTag,
    isolated: false,
    tainted: false,
    note: 'dry-run mode never injects desktop input',
  }
}

function observeWindows(request: ObserveWindowsRequest): WindowObservation {
  return {
    frontmostAppName: request.app,
    windows: [],
    observedAt: new Date().toISOString(),
  }
}

export function createDryRunExecutor(config: ComputerUseConfig): DesktopExecutor {
  const executionTarget = getDryRunExecutionTarget(config)

  return {
    kind: 'dry-run',
    describe: () => ({
      kind: 'dry-run',
      notes: [
        'desktop input is not injected',
        'screenshots are still attempted on the current host for debugging',
      ],
    }),
    getExecutionTarget: async () => executionTarget,
    getForegroundContext: getBestEffortForegroundContext,
    getDisplayInfo: () => probeDisplayInfo(config),
    getPermissionInfo: () => probePermissionInfo(config),
    observeWindows: async request => observeWindows(request),
    takeScreenshot: request => captureScreenshotArtifact({
      label: request.label,
      screenshotsDir: config.screenshotsDir,
      screenshotBinary: config.binaries.screencapture,
      timeoutMs: config.timeoutMs,
      executionTarget,
    }),
    openApp: async (_input: OpenAppActionInput) => result(['dry-run: app not opened'], executionTarget),
    focusApp: async (_input: FocusAppActionInput) => result(['dry-run: app not focused'], executionTarget),
    focusWindow: async (_input: FocusWindowActionInput) => result(['dry-run: window not focused (simulated success)'], executionTarget),
    setWindowBounds: async (_input: SetWindowBoundsActionInput) => result(['dry-run: window bounds not changed (simulated success)'], executionTarget),
    click: async (_input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => result(['dry-run: click not injected'], executionTarget),
    typeText: async (_input: TypeTextActionInput) => result(['dry-run: text not injected'], executionTarget),
    pressKeys: async (_input: PressKeysActionInput) => result(['dry-run: shortcut not injected'], executionTarget),
    scroll: async (_input: ScrollActionInput) => result(['dry-run: scroll not injected'], executionTarget),
    wait: async (input: WaitActionInput) => {
      await new Promise(resolve => setTimeout(resolve, Math.max(input.durationMs, 0)))
      return {
        performed: true,
        backend: 'dry-run',
        notes: ['dry-run: waited without desktop mutation'],
        executionTarget,
      }
    },
    openTestTarget: async () => ({
      launched: true,
      appName: 'dry-run-target',
      windowTitle: 'Dry Run Desktop Target',
      recommendedClickPoint: {
        x: 180,
        y: 150,
      },
      executionTarget,
    }),
  }
}
