import type { MultiDisplaySnapshot } from './display'
import type {
  ComputerUseConfig,
  CoordinateSpaceInfo,
  DisplayInfo,
  LastScreenshotInfo,
  LaunchContext,
  PermissionInfo,
  PermissionProbe,
} from './types'

import { hostname } from 'node:os'
import { basename } from 'node:path'
import { argv, pid, platform, ppid, title } from 'node:process'

import { enumerateDisplays } from './display'
import { errorMessageFromValue } from './utils/error-message'
import { runProcess } from './utils/process'
import { runSwiftScript } from './utils/swift'

export function buildCoordinateSpaceInfo(params: {
  config: ComputerUseConfig
  displayInfo?: DisplayInfo
  lastScreenshot?: LastScreenshotInfo
}): CoordinateSpaceInfo {
  const { allowedBounds } = params.config

  if (!allowedBounds) {
    return {
      allowedBounds,
      lastScreenshot: params.lastScreenshot,
      readyForMutations: false,
      reason: 'allowed bounds are not configured',
    }
  }

  if (!params.lastScreenshot?.width || !params.lastScreenshot?.height) {
    return {
      allowedBounds,
      lastScreenshot: params.lastScreenshot,
      readyForMutations: false,
      reason: 'capture a screenshot before real input so the coordinate spaces can be compared',
    }
  }

  if (allowedBounds.width === params.lastScreenshot.width && allowedBounds.height === params.lastScreenshot.height) {
    return {
      aligned: true,
      allowedBounds,
      lastScreenshot: params.lastScreenshot,
      readyForMutations: true,
      reason: 'screenshot dimensions match allowed bounds',
    }
  }

  const physicalPixelMismatch = params.displayInfo?.available
    && params.displayInfo.pixelWidth === params.lastScreenshot.width
    && params.displayInfo.pixelHeight === params.lastScreenshot.height
    && params.displayInfo.logicalWidth === allowedBounds.width
    && params.displayInfo.logicalHeight === allowedBounds.height

  return {
    aligned: false,
    allowedBounds,
    lastScreenshot: params.lastScreenshot,
    readyForMutations: false,
    reason: physicalPixelMismatch
      ? 'screenshot dimensions match physical pixels while allowed bounds match logical points; align Retina/backing scale before real input'
      : `screenshot ${params.lastScreenshot.width}x${params.lastScreenshot.height} does not match allowed bounds ${allowedBounds.width}x${allowedBounds.height}`,
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
      capturedAt: snapshot.capturedAt,
      combinedBounds: snapshot.combinedBounds,
      displayCount: 0,
      displays: [],
      note: 'display enumeration returned no connected displays',
      platform: targetPlatform,
    }
  }

  return {
    available: true,
    capturedAt: snapshot.capturedAt,
    combinedBounds: snapshot.combinedBounds,
    displayCount: snapshot.displays.length,
    displays: snapshot.displays,
    isRetina: mainDisplay.scaleFactor > 1,
    logicalHeight: mainDisplay.bounds.height,
    logicalWidth: mainDisplay.bounds.width,
    pixelHeight: mainDisplay.pixelHeight,
    pixelWidth: mainDisplay.pixelWidth,
    platform: targetPlatform,
    scaleFactor: mainDisplay.scaleFactor,
  }
}

export async function probeDisplayInfo(config: ComputerUseConfig): Promise<DisplayInfo> {
  if (platform !== 'darwin') {
    return {
      available: false,
      note: 'display probe is only implemented for macOS in this PoC',
      platform,
    }
  }

  try {
    return buildDisplayInfoFromSnapshot(await enumerateDisplays(config), platform)
  }
  catch (error) {
    return {
      available: false,
      note: errorMessageFromValue(error),
      platform,
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
    accessibility,
    automationToSystemEvents,
    screenRecording,
  }
}

export function resolveLaunchContext(config: ComputerUseConfig): LaunchContext {
  const launchHostProcess = inferLaunchHostProcess(config)

  return {
    argv: [...argv],
    hostName: hostname(),
    launchHostProcess,
    permissionChainHint: config.permissionChainHint || `${launchHostProcess} -> ${config.binaries.osascript} -> System Events`,
    pid,
    ppid,
    processTitle: title,
    sessionTag: config.sessionTag,
  }
}

function inferLaunchHostProcess(config: ComputerUseConfig) {
  const argv0 = argv[0]?.trim()
  return config.launchHostProcess || basename(argv0 || 'node')
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
      source: script,
      swiftBinary: config.binaries.swift,
      timeoutMs: config.timeoutMs,
    })

    return {
      checkedBy: 'AXIsProcessTrusted',
      status: stdout.trim() === 'granted' ? 'granted' : 'missing',
      target: resolveLaunchContext(config).launchHostProcess,
    }
  }
  catch (error) {
    return {
      checkedBy: 'AXIsProcessTrusted',
      note: errorMessageFromValue(error),
      status: 'unknown',
      target: resolveLaunchContext(config).launchHostProcess,
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
      checkedBy: 'osascript/System Events foreground probe',
      status: 'granted',
      target: `${launchContext.launchHostProcess} -> System Events`,
    }
  }
  catch (error) {
    return {
      checkedBy: 'osascript/System Events foreground probe',
      note: errorMessageFromValue(error),
      status: 'missing',
      target: `${launchContext.launchHostProcess} -> System Events`,
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
      source: script,
      swiftBinary: config.binaries.swift,
      timeoutMs: config.timeoutMs,
    })

    return {
      checkedBy: 'CGPreflightScreenCaptureAccess',
      status: stdout.trim() === 'granted' ? 'granted' : 'missing',
      target: resolveLaunchContext(config).launchHostProcess,
    }
  }
  catch (error) {
    return {
      checkedBy: 'CGPreflightScreenCaptureAccess',
      note: errorMessageFromValue(error),
      status: 'unknown',
      target: resolveLaunchContext(config).launchHostProcess,
    }
  }
}

function unsupportedProbe(target: string, note: string): PermissionProbe {
  return {
    note,
    status: 'unsupported',
    target,
  }
}
