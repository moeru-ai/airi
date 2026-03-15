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

import { existsSync, readdirSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:process'

import { appNamesMatch, getKnownAppLaunchNames } from '../app-aliases'
import { probeDisplayInfo, probePermissionInfo } from '../runtime-probes'
import { runProcess } from '../utils/process'
import { captureScreenshotArtifact } from '../utils/screenshot'
import { runSwiftScript } from '../utils/swift'

const buttonNames = {
  left: 0,
  right: 1,
  middle: 2,
} as const

const keyCodeMap: Record<string, number> = {
  a: 0,
  b: 11,
  c: 8,
  d: 2,
  e: 14,
  f: 3,
  g: 5,
  h: 4,
  i: 34,
  j: 38,
  k: 40,
  l: 37,
  m: 46,
  n: 45,
  o: 31,
  p: 35,
  q: 12,
  r: 15,
  s: 1,
  t: 17,
  u: 32,
  v: 9,
  w: 13,
  x: 7,
  y: 16,
  z: 6,
  0: 29,
  1: 18,
  2: 19,
  3: 20,
  4: 21,
  5: 23,
  6: 22,
  7: 26,
  8: 28,
  9: 25,
  enter: 36,
  return: 36,
  tab: 48,
  space: 49,
  escape: 53,
  esc: 53,
  delete: 51,
  backspace: 51,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
}

const modifierFlags: Record<string, string> = {
  command: '.maskCommand',
  cmd: '.maskCommand',
  shift: '.maskShift',
  control: '.maskControl',
  ctrl: '.maskControl',
  option: '.maskAlternate',
  alt: '.maskAlternate',
}

function createExecutionTarget(config: ComputerUseConfig): ExecutionTarget {
  return {
    mode: 'local-windowed',
    transport: 'local',
    hostName: hostname(),
    sessionTag: config.sessionTag,
    isolated: false,
    tainted: false,
    note: 'local macOS window automation via Swift + Quartz',
  }
}

function result(notes: string[], executionTarget: ExecutionTarget): ExecutorActionResult {
  return {
    performed: true,
    backend: 'macos-local',
    notes,
    executionTarget,
  }
}

function fallbackContext(reason: string): ForegroundContext {
  return {
    available: false,
    platform,
    unavailableReason: reason,
  }
}

async function runMacOsJsonScript<T>(config: ComputerUseConfig, source: string, stdinPayload?: unknown): Promise<T> {
  const { stdout } = await runSwiftScript({
    swiftBinary: config.binaries.swift,
    timeoutMs: config.timeoutMs,
    source,
    stdinPayload,
  })

  return JSON.parse(stdout.trim()) as T
}

function observeWindowsScript() {
  return String.raw`
import AppKit
import CoreGraphics
import Foundation

func boundsDict(_ value: NSDictionary?) -> [String: Int]? {
  guard let value else { return nil }
  var rect = CGRect.zero
  guard CGRectMakeWithDictionaryRepresentation(value, &rect) else { return nil }
  return [
    "x": Int(rect.origin.x.rounded()),
    "y": Int(rect.origin.y.rounded()),
    "width": Int(rect.size.width.rounded()),
    "height": Int(rect.size.height.rounded())
  ]
}

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]
let limit = (input["limit"] as? Int) ?? 12
let appFilter = ((input["app"] as? String) ?? "").lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
let frontmostAppName = NSWorkspace.shared.frontmostApplication?.localizedName

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let rawWindowInfo = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
var windows: [[String: Any]] = []
for window in rawWindowInfo {
  let ownerName = (window[kCGWindowOwnerName as String] as? String) ?? "Unknown"
  if !appFilter.isEmpty && !ownerName.lowercased().contains(appFilter) {
    continue
  }

  let alpha = window[kCGWindowAlpha as String] as? Double ?? 1.0
  let layer = window[kCGWindowLayer as String] as? Int ?? 0
  let bounds = boundsDict(window[kCGWindowBounds as String] as? NSDictionary)
  let title = (window[kCGWindowName as String] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
  let ownerPid = window[kCGWindowOwnerPID as String] as? Int ?? 0

  if alpha <= 0 || (bounds?["width"] ?? 0) <= 1 || (bounds?["height"] ?? 0) <= 1 {
    continue
  }

  windows.append([
    "id": "\(ownerPid):\(layer):\(title ?? ownerName)",
    "appName": ownerName,
    "title": title as Any,
    "bounds": bounds as Any,
    "ownerPid": ownerPid,
    "layer": layer,
    "isOnScreen": true,
  ])

  if windows.count >= limit {
    break
  }
}

let frontmostWindowTitle = windows.first(where: { ($0["appName"] as? String) == frontmostAppName })?["title"]
let payload: [String: Any] = [
  "frontmostAppName": frontmostAppName as Any,
  "frontmostWindowTitle": frontmostWindowTitle as Any,
  "windows": windows,
  "observedAt": ISO8601DateFormatter().string(from: Date()),
]

let data = try JSONSerialization.data(withJSONObject: payload, options: [])
print(String(data: data, encoding: .utf8)!)
`
}

function moveAndClickScript() {
  return String.raw`
import CoreGraphics
import Foundation

func mouseButton(_ value: Int) -> CGMouseButton {
  switch value {
  case 1: return .right
  case 2: return .center
  default: return .left
  }
}

func mouseDownType(_ button: CGMouseButton) -> CGEventType {
  switch button {
  case .right: return .rightMouseDown
  case .center: return .otherMouseDown
  default: return .leftMouseDown
  }
}

func mouseUpType(_ button: CGMouseButton) -> CGEventType {
  switch button {
  case .right: return .rightMouseUp
  case .center: return .otherMouseUp
  default: return .leftMouseUp
  }
}

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]
let trace = input["pointerTrace"] as? [[String: Any]] ?? []
let buttonRaw = input["button"] as? Int ?? 0
let clickCount = input["clickCount"] as? Int ?? 1
let button = mouseButton(buttonRaw)

for point in trace {
  let x = point["x"] as? Double ?? 0
  let y = point["y"] as? Double ?? 0
  let delayMs = point["delayMs"] as? Int ?? 0
  let location = CGPoint(x: x, y: y)
  if let moveEvent = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: location, mouseButton: .left) {
    moveEvent.post(tap: .cghidEventTap)
  }
  if delayMs > 0 {
    usleep(useconds_t(delayMs * 1000))
  }
}

let lastPoint = trace.last
let x = lastPoint?["x"] as? Double ?? 0
let y = lastPoint?["y"] as? Double ?? 0
let location = CGPoint(x: x, y: y)

for _ in 0..<max(clickCount, 1) {
  if let down = CGEvent(mouseEventSource: nil, mouseType: mouseDownType(button), mouseCursorPosition: location, mouseButton: button),
     let up = CGEvent(mouseEventSource: nil, mouseType: mouseUpType(button), mouseCursorPosition: location, mouseButton: button) {
    down.setIntegerValueField(.mouseEventClickState, value: Int64(clickCount))
    up.setIntegerValueField(.mouseEventClickState, value: Int64(clickCount))
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
  }
}

print("{}")
`
}

function typeTextScript() {
  return String.raw`
import CoreGraphics
import Foundation

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]
let text = input["text"] as? String ?? ""
let pressEnter = input["pressEnter"] as? Bool ?? false
let characterDelayMicros: useconds_t = 12_000
let settleDelayMicros: useconds_t = 80_000

func postText(_ chunk: String) {
  let chars = Array(chunk.utf16)
  let length = chars.count
  guard length > 0 else { return }
  chars.withUnsafeBufferPointer { buffer in
    if let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
       let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) {
      keyDown.keyboardSetUnicodeString(stringLength: length, unicodeString: buffer.baseAddress!)
      keyUp.keyboardSetUnicodeString(stringLength: length, unicodeString: buffer.baseAddress!)
      keyDown.post(tap: .cghidEventTap)
      keyUp.post(tap: .cghidEventTap)
    }
  }

  // NOTICE: Electron/Vue textareas can drop tail characters when a burst of
  // Quartz keyboard events is posted back-to-back with no pacing. A short
  // delay between Unicode events keeps the renderer input queue stable enough
  // for end-to-end desktop automation.
  usleep(characterDelayMicros)
}

for character in text {
  postText(String(character))
}

if !text.isEmpty {
  usleep(settleDelayMicros)
}

if pressEnter {
  if let down = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: true),
     let up = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: false) {
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
  }
}

print("{}")
`
}

function pressKeysScript(mainKeyCode: number, modifierMaskExpr: string) {
  return String.raw`
import CoreGraphics
import Foundation

let keyCode: CGKeyCode = ${mainKeyCode}
let modifierFlags: CGEventFlags = ${modifierMaskExpr}

if let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
   let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) {
  keyDown.flags = modifierFlags
  keyUp.flags = modifierFlags
  keyDown.post(tap: .cghidEventTap)
  keyUp.post(tap: .cghidEventTap)
}

print("{}")
`
}

function scrollScript() {
  return String.raw`
import CoreGraphics
import Foundation

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]
let x = input["x"] as? Double
let y = input["y"] as? Double
let deltaX = Int32(input["deltaX"] as? Double ?? 0)
let deltaY = Int32(input["deltaY"] as? Double ?? 0)

if let x, let y {
  let location = CGPoint(x: x, y: y)
  if let moveEvent = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: location, mouseButton: .left) {
    moveEvent.post(tap: .cghidEventTap)
  }
}

if let scrollEvent = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: deltaY, wheel2: deltaX, wheel3: 0) {
  scrollEvent.post(tap: .cghidEventTap)
}

print("{}")
`
}

async function observeWindows(config: ComputerUseConfig, request: ObserveWindowsRequest): Promise<WindowObservation> {
  return await runMacOsJsonScript<WindowObservation>(config, observeWindowsScript(), request)
}

function observationToForegroundContext(observation: WindowObservation): ForegroundContext {
  const frontmost = observation.windows.find(window => window.appName === observation.frontmostAppName)
  return {
    available: Boolean(observation.frontmostAppName),
    appName: observation.frontmostAppName,
    windowTitle: observation.frontmostWindowTitle,
    windowBounds: frontmost?.bounds,
    platform,
    unavailableReason: observation.frontmostAppName ? undefined : 'frontmost application unavailable',
  }
}

async function ensureMacOS() {
  if (platform !== 'darwin') {
    throw new Error('macos-local executor requires macOS')
  }
}

function resolveInstalledMacAppName(app: string) {
  const searchRoots = [
    '/Applications',
    join(process.env.HOME || '', 'Applications'),
  ].filter(Boolean)

  for (const root of searchRoots) {
    if (!existsSync(root)) {
      continue
    }

    const appBundle = readdirSync(root).find((entry) => {
      if (!entry.endsWith('.app')) {
        return false
      }

      const bundleName = entry.replace(/\.app$/u, '')
      return getKnownAppLaunchNames(app).some(candidate => appNamesMatch(bundleName, candidate))
    })

    if (appBundle) {
      return appBundle.replace(/\.app$/u, '')
    }
  }

  return app
}

async function runOpenCommand(config: ComputerUseConfig, app: string) {
  await runProcess(config.binaries.open, ['-a', resolveInstalledMacAppName(app)], {
    timeoutMs: config.timeoutMs,
  })
}

async function activateApp(config: ComputerUseConfig, app: string) {
  const resolvedApp = resolveInstalledMacAppName(app)
  await runProcess(config.binaries.osascript, [
    '-e',
    `tell application ${JSON.stringify(resolvedApp)} to activate`,
  ], {
    timeoutMs: config.timeoutMs,
  })
}

export function createMacOSLocalExecutor(config: ComputerUseConfig): DesktopExecutor {
  const executionTarget = createExecutionTarget(config)

  return {
    kind: 'macos-local',
    describe: () => ({
      kind: 'macos-local',
      notes: [
        'desktop actions run on the current macOS host',
        'window observation uses NSWorkspace + CGWindowList',
        'input injection uses Swift + Quartz CGEvent',
      ],
    }),
    getExecutionTarget: async () => executionTarget,
    getForegroundContext: async () => {
      try {
        await ensureMacOS()
        return observationToForegroundContext(await observeWindows(config, { limit: 8 }))
      }
      catch (error) {
        return fallbackContext(error instanceof Error ? error.message : String(error))
      }
    },
    getDisplayInfo: () => probeDisplayInfo(config),
    getPermissionInfo: () => probePermissionInfo(config),
    observeWindows: async (request) => {
      await ensureMacOS()
      return await observeWindows(config, request)
    },
    takeScreenshot: request => captureScreenshotArtifact({
      label: request.label,
      screenshotsDir: config.screenshotsDir,
      screenshotBinary: config.binaries.screencapture,
      timeoutMs: config.timeoutMs,
      executionTarget,
    }),
    openApp: async (input: OpenAppActionInput) => {
      await ensureMacOS()
      await runOpenCommand(config, input.app)
      return result([`opened app ${input.app}`], executionTarget)
    },
    focusApp: async (input: FocusAppActionInput) => {
      await ensureMacOS()
      await runOpenCommand(config, input.app)
      await activateApp(config, input.app)
      return result([`focused app ${input.app}`], executionTarget)
    },
    click: async (input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => {
      await ensureMacOS()
      await runMacOsJsonScript<Record<string, never>>(config, moveAndClickScript(), {
        pointerTrace: input.pointerTrace,
        button: buttonNames[input.button || 'left'],
        clickCount: input.clickCount ?? 1,
      })
      return {
        ...result(['clicked on local macOS desktop'], executionTarget),
        pointerTrace: input.pointerTrace,
      }
    },
    typeText: async (input: TypeTextActionInput) => {
      await ensureMacOS()
      await runMacOsJsonScript<Record<string, never>>(config, typeTextScript(), {
        text: input.text,
        pressEnter: input.pressEnter ?? false,
      })
      return result(['typed text on local macOS desktop'], executionTarget)
    },
    pressKeys: async (input: PressKeysActionInput) => {
      await ensureMacOS()
      const normalized = input.keys.map(key => key.trim().toLowerCase()).filter(Boolean)
      if (normalized.length === 0)
        throw new Error('press_keys requires at least one key')

      const mainKey = normalized.at(-1)!
      const keyCode = keyCodeMap[mainKey]
      if (typeof keyCode !== 'number') {
        throw new TypeError(`unsupported macOS key for press_keys: ${mainKey}`)
      }

      const modifiers = normalized.slice(0, -1)
      const modifierMaskExpr = modifiers.length > 0
        ? modifiers.map((modifier) => {
            const flag = modifierFlags[modifier]
            if (!flag)
              throw new Error(`unsupported modifier key: ${modifier}`)
            return flag
          }).join(' | ')
        : '[]'

      await runMacOsJsonScript<Record<string, never>>(config, pressKeysScript(keyCode, modifierMaskExpr), {})
      return result([`pressed keys ${normalized.join('+')}`], executionTarget)
    },
    scroll: async (input: ScrollActionInput) => {
      await ensureMacOS()
      await runMacOsJsonScript<Record<string, never>>(config, scrollScript(), {
        x: input.x,
        y: input.y,
        deltaX: input.deltaX ?? 0,
        deltaY: input.deltaY,
      })
      return result(['scrolled on local macOS desktop'], executionTarget)
    },
    wait: async (input: WaitActionInput) => {
      await new Promise(resolve => setTimeout(resolve, Math.max(input.durationMs, 0)))
      return result(['waited on local macOS desktop'], executionTarget)
    },
  }
}
