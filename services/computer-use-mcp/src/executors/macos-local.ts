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

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { env, platform } from 'node:process'

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

// NOTICE: computer-use-mcp runs these executor modules directly under Node/tsx.
// Keep Swift helpers as sibling files, but load them with `readFileSync(...)`
// instead of `?raw` so the runtime path stays compatible outside Vite bundling.
const observeWindowsScript = readFileSync(new URL('./observe-windows.swift', import.meta.url), 'utf8')

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

function semanticFocusWindowScript() {
  return String.raw`
import AppKit
import ApplicationServices
import Foundation

func readStringAttribute(_ element: AXUIElement, _ key: String) -> String? {
  var raw: AnyObject?
  let error = AXUIElementCopyAttributeValue(element, key as CFString, &raw)
  guard error == .success else { return nil }
  return raw as? String
}

func readIntAttribute(_ element: AXUIElement, _ key: String) -> Int? {
  var raw: AnyObject?
  let error = AXUIElementCopyAttributeValue(element, key as CFString, &raw)
  guard error == .success else { return nil }
  if let number = raw as? NSNumber {
    return number.intValue
  }
  return nil
}

func readBoolAttribute(_ element: AXUIElement, _ key: String) -> Bool? {
  var raw: AnyObject?
  let error = AXUIElementCopyAttributeValue(element, key as CFString, &raw)
  guard error == .success else { return nil }
  if let number = raw as? NSNumber {
    return number.boolValue
  }
  return nil
}

func readBoundsAttribute(_ element: AXUIElement) -> CGRect? {
  var rawPosition: AnyObject?
  var rawSize: AnyObject?
  let positionError = AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &rawPosition)
  let sizeError = AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &rawSize)
  guard positionError == .success, sizeError == .success,
        let positionValue = rawPosition, let sizeValue = rawSize,
        CFGetTypeID(positionValue) == AXValueGetTypeID(),
        CFGetTypeID(sizeValue) == AXValueGetTypeID() else {
    return nil
  }

  var point = CGPoint.zero
  var size = CGSize.zero
  guard AXValueGetType(positionValue as! AXValue) == .cgPoint,
        AXValueGetType(sizeValue as! AXValue) == .cgSize,
        AXValueGetValue(positionValue as! AXValue, .cgPoint, &point),
        AXValueGetValue(sizeValue as! AXValue, .cgSize, &size) else {
    return nil
  }

  return CGRect(origin: point, size: size)
}

func copyWindows(_ appElement: AXUIElement) -> [AXUIElement] {
  var raw: AnyObject?
  let error = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &raw)
  guard error == .success, let array = raw as? [AXUIElement] else { return [] }
  return array
}

func setBoolAttribute(_ element: AXUIElement, _ key: String, _ value: Bool) -> Bool {
  let cfValue: CFTypeRef = value ? kCFBooleanTrue : kCFBooleanFalse
  return AXUIElementSetAttributeValue(element, key as CFString, cfValue) == .success
}

func emit(_ payload: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: payload, options: [])
  print(String(data: data, encoding: .utf8)!)
}

func normalizedTitle(_ value: String?) -> String {
  return (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

func readBoundsHint(_ payload: [String: Any]?) -> CGRect? {
  guard let payload else { return nil }

  func number(_ key: String) -> Double? {
    if let value = payload[key] as? NSNumber {
      return value.doubleValue
    }
    return nil
  }

  guard let x = number("x"),
        let y = number("y"),
        let width = number("width"),
        let height = number("height"),
        width > 0,
        height > 0 else {
    return nil
  }

  return CGRect(x: x, y: y, width: width, height: height)
}

func boundsApproximatelyMatch(_ lhs: CGRect, _ rhs: CGRect, tolerance: Double = 24) -> Bool {
  return abs(lhs.origin.x - rhs.origin.x) <= tolerance
    && abs(lhs.origin.y - rhs.origin.y) <= tolerance
    && abs(lhs.size.width - rhs.size.width) <= tolerance
    && abs(lhs.size.height - rhs.size.height) <= tolerance
}

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]

let ownerPid = input["ownerPid"] as? Int ?? 0
let windowNumberHint = input["windowNumber"] as? Int ?? 0
let titleHint = normalizedTitle(input["title"] as? String)
let observedBoundsHint = readBoundsHint((input["observedBounds"] as? [String: Any]) ?? (input["bounds"] as? [String: Any]))

if ownerPid <= 0 {
  emit([
    "success": false,
    "semanticAvailable": false,
    "reason": "missing_owner_pid"
  ])
  exit(0)
}

if !AXIsProcessTrusted() {
  emit([
    "success": false,
    "semanticAvailable": false,
    "reason": "accessibility_not_trusted"
  ])
  exit(0)
}

let pid = pid_t(ownerPid)
let appElement = AXUIElementCreateApplication(pid)
let windows = copyWindows(appElement)

if windows.isEmpty {
  emit([
    "success": false,
    "semanticAvailable": true,
    "reason": "no_ax_windows_for_app"
  ])
  exit(0)
}

var selected: AXUIElement?
var matchedTitle: String?
var matchedWindowNumber: Int?
var matchStrategy: String?
var titleMatchCount = 0
var boundsMatchCount = 0

if windowNumberHint > 0 {
  for window in windows {
    let axWindowNumber = readIntAttribute(window, "AXWindowNumber")
    if axWindowNumber == windowNumberHint {
      selected = window
      matchedTitle = readStringAttribute(window, kAXTitleAttribute as String)
      matchedWindowNumber = axWindowNumber
      matchStrategy = "window_number"
      break
    }
  }
}

var titleMatches: [AXUIElement] = []
if selected == nil && !titleHint.isEmpty {
  titleMatches = windows.filter { normalizedTitle(readStringAttribute($0, kAXTitleAttribute as String)) == titleHint }
  titleMatchCount = titleMatches.count

  if titleMatches.count == 1 {
    selected = titleMatches[0]
    matchedTitle = readStringAttribute(titleMatches[0], kAXTitleAttribute as String)
    matchedWindowNumber = readIntAttribute(titleMatches[0], "AXWindowNumber")
    matchStrategy = "title"
  }
}

if selected == nil, let observedBoundsHint {
  let candidatePool = !titleMatches.isEmpty ? titleMatches : windows
  let boundsMatches = candidatePool.filter { window in
    guard let windowBounds = readBoundsAttribute(window) else { return false }
    return boundsApproximatelyMatch(windowBounds, observedBoundsHint)
  }
  boundsMatchCount = boundsMatches.count

  if boundsMatches.count == 1 {
    selected = boundsMatches[0]
    matchedTitle = readStringAttribute(boundsMatches[0], kAXTitleAttribute as String)
    matchedWindowNumber = readIntAttribute(boundsMatches[0], "AXWindowNumber")
    matchStrategy = titleMatches.isEmpty ? "bounds" : "title_then_bounds"
  }
}

if selected == nil {
  var reason = "ax_window_not_found_by_identity"
  if windowNumberHint > 0 {
    reason = "ax_window_not_found_by_window_number"
  }
  if titleMatchCount > 1 && boundsMatchCount == 0 {
    reason = "ax_window_ambiguous_title_match"
  } else if boundsMatchCount > 1 {
    reason = titleMatchCount > 0 ? "ax_window_ambiguous_title_bounds_match" : "ax_window_ambiguous_bounds_match"
  } else if windowNumberHint > 0 && (titleMatchCount > 0 || boundsMatchCount > 0) {
    reason = "ax_window_not_found_by_window_number_but_secondary_hints_unresolved"
  }

  emit([
    "success": false,
    "semanticAvailable": true,
    "reason": reason,
    "titleMatchCount": titleMatchCount,
    "boundsMatchCount": boundsMatchCount
  ])
  exit(0)
}

guard let targetWindow = selected else {
  emit([
    "success": false,
    "semanticAvailable": true,
    "reason": "ax_window_not_found_by_identity"
  ])
  exit(0)
}

let app = NSRunningApplication(processIdentifier: pid)
let activated = app?.activate(options: [.activateIgnoringOtherApps]) ?? false
let mainSet = setBoolAttribute(targetWindow, kAXMainAttribute as String, true)
let focusedSet = setBoolAttribute(targetWindow, kAXFocusedAttribute as String, true)
RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
let mainVerified = readBoolAttribute(targetWindow, kAXMainAttribute as String) ?? false
let focusedVerified = readBoolAttribute(targetWindow, kAXFocusedAttribute as String) ?? false
let success = mainVerified || focusedVerified

emit([
  "success": success,
  "semanticAvailable": true,
  "reason": success ? "semantic_focus_applied" : "semantic_focus_failed",
  "activated": activated,
  "mainSet": mainSet,
  "focusedSet": focusedSet,
  "mainVerified": mainVerified,
  "focusedVerified": focusedVerified,
  "matchedTitle": matchedTitle as Any,
  "matchedWindowNumber": matchedWindowNumber as Any,
  "matchStrategy": matchStrategy as Any,
  "titleMatchCount": titleMatchCount,
  "boundsMatchCount": boundsMatchCount
])
`
}

function semanticSetWindowBoundsScript() {
  return String.raw`
import AppKit
import ApplicationServices
import Foundation

func readStringAttribute(_ element: AXUIElement, _ key: String) -> String? {
  var raw: AnyObject?
  let error = AXUIElementCopyAttributeValue(element, key as CFString, &raw)
  guard error == .success else { return nil }
  return raw as? String
}

func readIntAttribute(_ element: AXUIElement, _ key: String) -> Int? {
  var raw: AnyObject?
  let error = AXUIElementCopyAttributeValue(element, key as CFString, &raw)
  guard error == .success else { return nil }
  if let number = raw as? NSNumber {
    return number.intValue
  }
  return nil
}

func readBoundsAttribute(_ element: AXUIElement) -> CGRect? {
  var rawPosition: AnyObject?
  var rawSize: AnyObject?
  let positionError = AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &rawPosition)
  let sizeError = AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &rawSize)
  guard positionError == .success, sizeError == .success,
        let positionValue = rawPosition, let sizeValue = rawSize,
        CFGetTypeID(positionValue) == AXValueGetTypeID(),
        CFGetTypeID(sizeValue) == AXValueGetTypeID() else {
    return nil
  }

  var point = CGPoint.zero
  var size = CGSize.zero
  guard AXValueGetType(positionValue as! AXValue) == .cgPoint,
        AXValueGetType(sizeValue as! AXValue) == .cgSize,
        AXValueGetValue(positionValue as! AXValue, .cgPoint, &point),
        AXValueGetValue(sizeValue as! AXValue, .cgSize, &size) else {
    return nil
  }

  return CGRect(origin: point, size: size)
}

func copyWindows(_ appElement: AXUIElement) -> [AXUIElement] {
  var raw: AnyObject?
  let error = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &raw)
  guard error == .success, let array = raw as? [AXUIElement] else { return [] }
  return array
}

func setPosition(_ element: AXUIElement, x: Double, y: Double) -> Bool {
  var point = CGPoint(x: x, y: y)
  guard let value = AXValueCreate(.cgPoint, &point) else { return false }
  return AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, value) == .success
}

func setSize(_ element: AXUIElement, width: Double, height: Double) -> Bool {
  var size = CGSize(width: width, height: height)
  guard let value = AXValueCreate(.cgSize, &size) else { return false }
  return AXUIElementSetAttributeValue(element, kAXSizeAttribute as CFString, value) == .success
}

func emit(_ payload: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: payload, options: [])
  print(String(data: data, encoding: .utf8)!)
}

func normalizedTitle(_ value: String?) -> String {
  return (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

func readBoundsHint(_ payload: [String: Any]?) -> CGRect? {
  guard let payload else { return nil }

  func number(_ key: String) -> Double? {
    if let value = payload[key] as? NSNumber {
      return value.doubleValue
    }
    return nil
  }

  guard let x = number("x"),
        let y = number("y"),
        let width = number("width"),
        let height = number("height"),
        width > 0,
        height > 0 else {
    return nil
  }

  return CGRect(x: x, y: y, width: width, height: height)
}

func boundsApproximatelyMatch(_ lhs: CGRect, _ rhs: CGRect, tolerance: Double = 24) -> Bool {
  return abs(lhs.origin.x - rhs.origin.x) <= tolerance
    && abs(lhs.origin.y - rhs.origin.y) <= tolerance
    && abs(lhs.size.width - rhs.size.width) <= tolerance
    && abs(lhs.size.height - rhs.size.height) <= tolerance
}

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]

let ownerPid = input["ownerPid"] as? Int ?? 0
let windowNumberHint = input["windowNumber"] as? Int ?? 0
let titleHint = normalizedTitle(input["title"] as? String)
let observedBoundsHint = readBoundsHint(input["observedBounds"] as? [String: Any])
let bounds = input["bounds"] as? [String: Any] ?? [:]
let x = (bounds["x"] as? NSNumber)?.doubleValue ?? 0
let y = (bounds["y"] as? NSNumber)?.doubleValue ?? 0
let width = (bounds["width"] as? NSNumber)?.doubleValue ?? 0
let height = (bounds["height"] as? NSNumber)?.doubleValue ?? 0

if ownerPid <= 0 {
  emit([
    "success": false,
    "semanticAvailable": false,
    "reason": "missing_owner_pid"
  ])
  exit(0)
}

if width <= 0 || height <= 0 {
  emit([
    "success": false,
    "semanticAvailable": true,
    "reason": "invalid_bounds"
  ])
  exit(0)
}

if !AXIsProcessTrusted() {
  emit([
    "success": false,
    "semanticAvailable": false,
    "reason": "accessibility_not_trusted"
  ])
  exit(0)
}

let pid = pid_t(ownerPid)
let appElement = AXUIElementCreateApplication(pid)
let windows = copyWindows(appElement)

if windows.isEmpty {
  emit([
    "success": false,
    "semanticAvailable": true,
    "reason": "no_ax_windows_for_app"
  ])
  exit(0)
}

var selected: AXUIElement?
var titleMatchCount = 0
var boundsMatchCount = 0
var matchStrategy: String?

if windowNumberHint > 0 {
  for window in windows {
    let axWindowNumber = readIntAttribute(window, "AXWindowNumber")
    if axWindowNumber == windowNumberHint {
      selected = window
      matchStrategy = "window_number"
      break
    }
  }
}

var titleMatches: [AXUIElement] = []
if selected == nil && !titleHint.isEmpty {
  titleMatches = windows.filter { normalizedTitle(readStringAttribute($0, kAXTitleAttribute as String)) == titleHint }
  titleMatchCount = titleMatches.count

  if titleMatches.count == 1 {
    selected = titleMatches[0]
    matchStrategy = "title"
  }
}

if selected == nil, let observedBoundsHint {
  let candidatePool = !titleMatches.isEmpty ? titleMatches : windows
  let boundsMatches = candidatePool.filter { window in
    guard let windowBounds = readBoundsAttribute(window) else { return false }
    return boundsApproximatelyMatch(windowBounds, observedBoundsHint)
  }
  boundsMatchCount = boundsMatches.count

  if boundsMatches.count == 1 {
    selected = boundsMatches[0]
    matchStrategy = titleMatches.isEmpty ? "bounds" : "title_then_bounds"
  }
}

guard let targetWindow = selected else {
  var reason = "ax_window_not_found_by_identity"
  if windowNumberHint > 0 {
    reason = "ax_window_not_found_by_window_number"
  }
  if titleMatchCount > 1 && boundsMatchCount == 0 {
    reason = "ax_window_ambiguous_title_match"
  } else if boundsMatchCount > 1 {
    reason = titleMatchCount > 0 ? "ax_window_ambiguous_title_bounds_match" : "ax_window_ambiguous_bounds_match"
  } else if windowNumberHint > 0 && (titleMatchCount > 0 || boundsMatchCount > 0) {
    reason = "ax_window_not_found_by_window_number_but_secondary_hints_unresolved"
  }

  emit([
    "success": false,
    "semanticAvailable": true,
    "reason": reason,
    "titleMatchCount": titleMatchCount,
    "boundsMatchCount": boundsMatchCount
  ])
  exit(0)
}

let positionSet = setPosition(targetWindow, x: x, y: y)
let sizeSet = setSize(targetWindow, width: width, height: height)
let success = positionSet && sizeSet

emit([
  "success": success,
  "semanticAvailable": true,
  "reason": success ? "semantic_set_bounds_applied" : "semantic_set_bounds_failed",
  "positionSet": positionSet,
  "sizeSet": sizeSet,
  "matchStrategy": matchStrategy as Any,
  "titleMatchCount": titleMatchCount,
  "boundsMatchCount": boundsMatchCount
])
`
}

function parseWindowIdentity(windowId: string) {
  if (windowId.startsWith('cg:')) {
    const windowNumber = Number.parseInt(windowId.slice(3), 10)
    return {
      ownerPid: undefined,
      layer: undefined,
      windowNumber: Number.isFinite(windowNumber) ? windowNumber : undefined,
      titleHint: undefined,
    }
  }

  const [ownerPidRaw, layerRaw, ...titleParts] = windowId.split(':')
  const ownerPid = Number.parseInt(ownerPidRaw || '', 10)
  const layer = Number.parseInt(layerRaw || '', 10)

  return {
    ownerPid: Number.isFinite(ownerPid) ? ownerPid : undefined,
    layer: Number.isFinite(layer) ? layer : undefined,
    windowNumber: undefined,
    titleHint: titleParts.join(':').trim() || undefined,
  }
}

async function observeWindows(config: ComputerUseConfig, request: ObserveWindowsRequest): Promise<WindowObservation> {
  return await runMacOsJsonScript<WindowObservation>(config, observeWindowsScript, request)
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
    join(env.HOME || '', 'Applications'),
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
    focusWindow: async (input: FocusWindowActionInput) => {
      await ensureMacOS()
      const identity = parseWindowIdentity(input.windowId)
      const semanticResult = await runMacOsJsonScript<{
        success: boolean
        semanticAvailable: boolean
        reason: string
      }>(config, semanticFocusWindowScript(), {
        ownerPid: input.ownerPid ?? identity.ownerPid,
        windowNumber: input.windowNumber ?? identity.windowNumber,
        layer: identity.layer,
        title: input.title || identity.titleHint,
        observedBounds: input.observedBounds ?? input.bounds,
        appName: input.appName,
      })

      if (semanticResult.success) {
        return result([
          `focused window ${input.windowId}`,
          'semantic_focus_applied',
        ], executionTarget)
      }

      if (semanticResult.semanticAvailable) {
        throw new Error(`focus_window semantic focus failed: ${semanticResult.reason}`)
      }

      if (!input.appName || !input.bounds) {
        throw new Error(`focus_window fallback unavailable: ${semanticResult.reason}`)
      }

      await runOpenCommand(config, input.appName)
      await activateApp(config, input.appName)

      const center = {
        x: Math.round(input.bounds.x + input.bounds.width / 2),
        y: Math.round(input.bounds.y + input.bounds.height / 2),
      }

      await runMacOsJsonScript<Record<string, never>>(config, moveAndClickScript(), {
        pointerTrace: [{ x: center.x, y: center.y, delayMs: 0 }],
        button: buttonNames.left,
        clickCount: 1,
      })

      return result([
        `focused window ${input.windowId}`,
        'semantic_unavailable_fallback_focus_app_and_center_click',
      ], executionTarget)
    },
    setWindowBounds: async (input: SetWindowBoundsActionInput) => {
      await ensureMacOS()
      const identity = parseWindowIdentity(input.windowId)
      const semanticResult = await runMacOsJsonScript<{
        success: boolean
        semanticAvailable: boolean
        reason: string
      }>(config, semanticSetWindowBoundsScript(), {
        ownerPid: input.ownerPid ?? identity.ownerPid,
        windowNumber: input.windowNumber ?? identity.windowNumber,
        layer: identity.layer,
        title: input.title || identity.titleHint,
        appName: input.appName,
        observedBounds: input.observedBounds,
        bounds: input.bounds,
      })

      if (semanticResult.success) {
        return result([
          `set bounds for window ${input.windowId}`,
          'semantic_set_bounds_applied',
        ], executionTarget)
      }

      if (!semanticResult.semanticAvailable) {
        throw new Error(`set_window_bounds unsupported: ${semanticResult.reason}`)
      }

      throw new Error(`set_window_bounds failed: ${semanticResult.reason}`)
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
