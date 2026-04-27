import type {
  ComputerUseConfig,
  CoordinateSpaceInfo,
  DisplayInfo,
  LastScreenshotInfo,
  LaunchContext,
  PermissionInfo,
  PermissionProbe,
} from './types'
import type { MultiDisplaySnapshot } from './display'

import { hostname } from 'node:os'
import { basename } from 'node:path'
import { argv, pid, platform, ppid, title } from 'node:process'

import { enumerateDisplays } from './display'
import { runProcess } from './utils/process'
import { runSwiftScript } from './utils/swift'

function unsupportedProbe(target: string, note: string): PermissionProbe {
  return {
    status: 'unsupported',
    target,
    note,
  }
}

function inferLaunchHostProcess(config: ComputerUseConfig) {
  const argv0 = argv[0]?.trim()
  return config.launchHostProcess || basename(argv0 || 'node')
}

export function resolveLaunchContext(config: ComputerUseConfig): LaunchContext {
  const launchHostProcess = inferLaunchHostProcess(config)

  return {
    hostName: hostname(),
    sessionTag: config.sessionTag,
    pid,
    ppid,
    processTitle: title,
    argv: [...argv],
    launchHostProcess,
    permissionChainHint: config.permissionChainHint || `${launchHostProcess} -> ${config.binaries.osascript} -> System Events`,
  }
}

/**
 * Builds the public runtime display facts from the native display snapshot.
 *
 * Use when:
 * - Publishing display facts through desktop capabilities/state
 * - Preserving legacy main-display fields while exposing multi-display bounds
 *
 * Expects:
 * - `snapshot` uses AIRI's top-left global logical coordinate space
 *
 * Returns:
 * - DisplayInfo with legacy main-display fields and complete display list
 */
export function buildDisplayInfoFromSnapshot(
  snapshot: MultiDisplaySnapshot,
  targetPlatform: NodeJS.Platform = platform,
): DisplayInfo {
  const mainDisplay = snapshot.displays.find(display => display.isMain) ?? snapshot.displays[0]

  if (!mainDisplay) {
    return {
      available: false,
      platform: targetPlatform,
      displayCount: 0,
      displays: [],
      combinedBounds: snapshot.combinedBounds,
      capturedAt: snapshot.capturedAt,
      note: 'display enumeration returned no connected displays',
    }
  }

  return {
    available: true,
    platform: targetPlatform,
    logicalWidth: mainDisplay.bounds.width,
    logicalHeight: mainDisplay.bounds.height,
    pixelWidth: mainDisplay.pixelWidth,
    pixelHeight: mainDisplay.pixelHeight,
    scaleFactor: mainDisplay.scaleFactor,
    isRetina: mainDisplay.scaleFactor > 1,
    displayCount: snapshot.displays.length,
    displays: snapshot.displays,
    combinedBounds: snapshot.combinedBounds,
    capturedAt: snapshot.capturedAt,
  }
}

export async function probeDisplayInfo(config: ComputerUseConfig): Promise<DisplayInfo> {
  if (platform !== 'darwin') {
    return {
      available: false,
      platform,
      note: 'display probe is only implemented for macOS in this PoC',
    }
  }

  try {
    return buildDisplayInfoFromSnapshot(await enumerateDisplays(config), platform)
  }
  catch (error) {
    return {
      available: false,
      platform,
      note: error instanceof Error ? error.message : String(error),
    }
  }
}

async function probeAccessibility(config: ComputerUseConfig): Promise<PermissionProbe> {
  if (platform !== 'darwin') {
    return unsupportedProbe(resolveLaunchContext(config).launchHostProcess, 'accessibility probe is only implemented on macOS')
  }

  const script = `
import ApplicationServices
print(AXIsProcessTrusted() ? "granted" : "missing")
`

  try {
    const { stdout } = await runSwiftScript({
      swiftBinary: config.binaries.swift,
      timeoutMs: config.timeoutMs,
      source: script,
    })

    return {
      status: stdout.trim() === 'granted' ? 'granted' : 'missing',
      target: resolveLaunchContext(config).launchHostProcess,
      checkedBy: 'AXIsProcessTrusted',
    }
  }
  catch (error) {
    return {
      status: 'unknown',
      target: resolveLaunchContext(config).launchHostProcess,
      checkedBy: 'AXIsProcessTrusted',
      note: error instanceof Error ? error.message : String(error),
    }
  }
}

async function probeScreenRecording(config: ComputerUseConfig): Promise<PermissionProbe> {
  if (platform !== 'darwin') {
    return unsupportedProbe(resolveLaunchContext(config).launchHostProcess, 'screen recording probe is only implemented on macOS')
  }

  const script = `
import CoreGraphics
import Foundation
print(CGPreflightScreenCaptureAccess() ? "granted" : "missing")
`

  try {
    const { stdout } = await runSwiftScript({
      swiftBinary: config.binaries.swift,
      timeoutMs: config.timeoutMs,
      source: script,
    })

    return {
      status: stdout.trim() === 'granted' ? 'granted' : 'missing',
      target: resolveLaunchContext(config).launchHostProcess,
      checkedBy: 'CGPreflightScreenCaptureAccess',
    }
  }
  catch (error) {
    return {
      status: 'unknown',
      target: resolveLaunchContext(config).launchHostProcess,
      checkedBy: 'CGPreflightScreenCaptureAccess',
      note: error instanceof Error ? error.message : String(error),
    }
  }
}

async function probeAutomation(config: ComputerUseConfig): Promise<PermissionProbe> {
  const launchContext = resolveLaunchContext(config)

  if (platform !== 'darwin') {
    return unsupportedProbe(`${launchContext.launchHostProcess} -> System Events`, 'automation probe is only implemented on macOS')
  }

  try {
    await runProcess(config.binaries.osascript, [
      '-e',
      'tell application "System Events"',
      '-e',
      'return name of first application process whose frontmost is true',
      '-e',
      'end tell',
    ], {
      timeoutMs: config.timeoutMs,
    })

    return {
      status: 'granted',
      target: `${launchContext.launchHostProcess} -> System Events`,
      checkedBy: 'osascript/System Events foreground probe',
    }
  }
  catch (error) {
    return {
      status: 'missing',
      target: `${launchContext.launchHostProcess} -> System Events`,
      checkedBy: 'osascript/System Events foreground probe',
      note: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function probePermissionInfo(config: ComputerUseConfig): Promise<PermissionInfo> {
  const [screenRecording, accessibility, automationToSystemEvents] = await Promise.all([
    probeScreenRecording(config),
    probeAccessibility(config),
    probeAutomation(config),
  ])

  return {
    screenRecording,
    accessibility,
    automationToSystemEvents,
  }
}

export function buildCoordinateSpaceInfo(params: {
  config: ComputerUseConfig
  lastScreenshot?: LastScreenshotInfo
  displayInfo?: DisplayInfo
}): CoordinateSpaceInfo {
  const { allowedBounds } = params.config

  if (!allowedBounds) {
    return {
      readyForMutations: false,
      reason: 'allowed bounds are not configured',
      allowedBounds,
      lastScreenshot: params.lastScreenshot,
    }
  }

  if (!params.lastScreenshot?.width || !params.lastScreenshot?.height) {
    return {
      readyForMutations: false,
      reason: 'capture a screenshot before real input so the coordinate spaces can be compared',
      allowedBounds,
      lastScreenshot: params.lastScreenshot,
    }
  }

  if (allowedBounds.width === params.lastScreenshot.width && allowedBounds.height === params.lastScreenshot.height) {
    return {
      readyForMutations: true,
      aligned: true,
      reason: 'screenshot dimensions match allowed bounds',
      allowedBounds,
      lastScreenshot: params.lastScreenshot,
    }
  }

  const physicalPixelMismatch = params.displayInfo?.available
    && params.displayInfo.pixelWidth === params.lastScreenshot.width
    && params.displayInfo.pixelHeight === params.lastScreenshot.height
    && params.displayInfo.logicalWidth === allowedBounds.width
    && params.displayInfo.logicalHeight === allowedBounds.height

  return {
    readyForMutations: false,
    aligned: false,
    reason: physicalPixelMismatch
      ? 'screenshot dimensions match physical pixels while allowed bounds match logical points; align Retina/backing scale before real input'
      : `screenshot ${params.lastScreenshot.width}x${params.lastScreenshot.height} does not match allowed bounds ${allowedBounds.width}x${allowedBounds.height}`,
    allowedBounds,
    lastScreenshot: params.lastScreenshot,
  }
}
