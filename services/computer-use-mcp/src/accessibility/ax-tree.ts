/**
 * macOS Accessibility tree capture via Swift + AXUIElement API.
 *
 * Runs an inline Swift script that walks the AXTree of the frontmost (or
 * specified) application and returns a JSON tree. The tree is then parsed
 * into the `AXSnapshot` structure used by the MCP tool layer.
 */

import type { ComputerUseConfig } from '../types'
import type { AXNode, AXSnapshot, AXSnapshotRequest, AXSnapshotTextOptions } from './types'

import { platform } from 'node:process'

import { runSwiftScript } from '../utils/swift'

let nextSnapshotId = 1

/**
 * Swift source that uses ApplicationServices / AXUIElement to walk the
 * accessibility tree of a target process. Input is passed via the
 * COMPUTER_USE_SWIFT_STDIN environment variable as JSON.
 *
 * Output format:
 * ```json
 * {
 *   "pid": 1234,
 *   "appName": "Finder",
 *   "root": { "role": "AXApplication", "title": "Finder", ... },
 *   "truncated": false
 * }
 * ```
 */
function axTreeScript(): string {
  return String.raw`
import ApplicationServices
import AppKit
import Foundation

struct AXNodeJSON: Encodable {
  let role: String
  let title: String?
  let value: String?
  let description: String?
  let enabled: Bool?
  let focused: Bool?
  let bounds: BoundsJSON?
  let children: [AXNodeJSON]
}

struct BoundsJSON: Encodable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

struct OutputJSON: Encodable {
  let pid: Int32
  let appName: String
  let root: AXNodeJSON?
  let truncated: Bool
}

func getStringAttr(_ element: AXUIElement, _ attr: String) -> String? {
  var value: AnyObject?
  guard AXUIElementCopyAttributeValue(element, attr as CFString, &value) == .success else { return nil }
  return value as? String
}

func getBoolAttr(_ element: AXUIElement, _ attr: String) -> Bool? {
  var value: AnyObject?
  guard AXUIElementCopyAttributeValue(element, attr as CFString, &value) == .success else { return nil }
  if let num = value as? NSNumber { return num.boolValue }
  return nil
}

func getBounds(_ element: AXUIElement) -> BoundsJSON? {
  var posValue: AnyObject?
  var sizeValue: AnyObject?
  guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as String as CFString, &posValue) == .success,
        AXUIElementCopyAttributeValue(element, kAXSizeAttribute as String as CFString, &sizeValue) == .success
  else { return nil }

  let posType = AXValueGetType(posValue as! AXValue)
  let sizeType = AXValueGetType(sizeValue as! AXValue)
  guard posType == .cgPoint, sizeType == .cgSize else { return nil }

  var point = CGPoint.zero
  var size = CGSize.zero
  AXValueGetValue(posValue as! AXValue, .cgPoint, &point)
  AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)

  return BoundsJSON(
    x: Int(point.x.rounded()),
    y: Int(point.y.rounded()),
    width: Int(size.width.rounded()),
    height: Int(size.height.rounded())
  )
}

func walkTree(_ element: AXUIElement, depth: Int, maxDepth: Int, nodeCount: inout Int, maxNodes: Int, verbose: Bool) -> AXNodeJSON? {
  if depth > maxDepth || nodeCount >= maxNodes { return nil }
  nodeCount += 1

  let role = getStringAttr(element, kAXRoleAttribute as String) ?? ""
  let title = getStringAttr(element, kAXTitleAttribute as String)
  let valueStr: String? = {
    var raw: AnyObject?
    guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as String as CFString, &raw) == .success else { return nil }
    if let s = raw as? String { return s.count > 500 ? String(s.prefix(500)) : s }
    if let n = raw as? NSNumber { return n.stringValue }
    return nil
  }()
  let desc = getStringAttr(element, kAXDescriptionAttribute as String)

  if !verbose && role.isEmpty && title == nil && desc == nil && valueStr == nil {
    return nil
  }

  let enabled = getBoolAttr(element, kAXEnabledAttribute as String)
  let focused = getBoolAttr(element, kAXFocusedAttribute as String)
  let bounds = getBounds(element)

  var childNodes: [AXNodeJSON] = []
  var childrenRef: AnyObject?
  if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as String as CFString, &childrenRef) == .success,
     let children = childrenRef as? [AXUIElement] {
    for child in children {
      if let childNode = walkTree(child, depth: depth + 1, maxDepth: maxDepth, nodeCount: &nodeCount, maxNodes: maxNodes, verbose: verbose) {
        childNodes.append(childNode)
      }
    }
  }

  return AXNodeJSON(
    role: role,
    title: title,
    value: valueStr,
    description: desc,
    enabled: enabled,
    focused: focused,
    bounds: bounds,
    children: childNodes
  )
}

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]

let maxDepth = (input["maxDepth"] as? Int) ?? 15
let maxNodes = (input["maxNodes"] as? Int) ?? 2000
let verbose = (input["verbose"] as? Bool) ?? false
let targetPid: Int32? = (input["pid"] as? Int).map { Int32($0) }

let pid: Int32
let appName: String

if let targetPid {
  pid = targetPid
  let app = NSRunningApplication(processIdentifier: targetPid)
  appName = app?.localizedName ?? "pid:\(targetPid)"
} else {
  guard let frontApp = NSWorkspace.shared.frontmostApplication else {
    let output = OutputJSON(pid: 0, appName: "unknown", root: nil, truncated: false)
    let data = try JSONEncoder().encode(output)
    print(String(data: data, encoding: .utf8)!)
    exit(0)
  }
  pid = frontApp.processIdentifier
  appName = frontApp.localizedName ?? "unknown"
}

let appElement = AXUIElementCreateApplication(pid)
var nodeCount = 0
let root = walkTree(appElement, depth: 0, maxDepth: maxDepth, nodeCount: &nodeCount, maxNodes: maxNodes, verbose: verbose)

let output = OutputJSON(pid: pid, appName: appName, root: root, truncated: nodeCount >= maxNodes)
let encoder = JSONEncoder()
let data = try encoder.encode(output)
print(String(data: data, encoding: .utf8)!)
`
}

interface RawAXNode {
  role: string
  title?: string
  value?: string
  description?: string
  enabled?: boolean
  focused?: boolean
  bounds?: { x: number, y: number, width: number, height: number }
  children?: RawAXNode[]
}

interface RawAXOutput {
  pid: number
  appName: string
  root?: RawAXNode
  truncated: boolean
}

/**
 * Assign stable uids to each node and build a flat lookup table.
 */
function assignUids(
  raw: RawAXNode,
  snapshotId: string,
  uidToNode: Map<string, AXNode>,
): AXNode {
  let counter = 0

  function walk(node: RawAXNode): AXNode {
    const uid = `${snapshotId}_${counter++}`
    const axNode: AXNode = {
      uid,
      role: node.role,
      title: node.title,
      value: node.value,
      description: node.description,
      enabled: node.enabled,
      focused: node.focused,
      bounds: node.bounds,
      children: (node.children ?? []).map(walk),
    }
    uidToNode.set(uid, axNode)
    return axNode
  }

  return walk(raw)
}

/**
 * Capture the accessibility tree of the frontmost (or specified) macOS app.
 */
export async function captureAXTree(
  config: ComputerUseConfig,
  request: AXSnapshotRequest = {},
): Promise<AXSnapshot> {
  if (platform !== 'darwin') {
    throw new Error('accessibility tree capture is only supported on macOS')
  }

  const { stdout } = await runSwiftScript({
    swiftBinary: config.binaries.swift,
    timeoutMs: config.timeoutMs,
    source: axTreeScript(),
    stdinPayload: {
      pid: request.pid,
      maxDepth: request.maxDepth ?? 15,
      maxNodes: request.maxNodes ?? 2000,
      verbose: request.verbose ?? false,
    },
  })

  const raw = JSON.parse(stdout.trim()) as RawAXOutput
  const snapshotId = String(nextSnapshotId++)
  const uidToNode = new Map<string, AXNode>()

  const root: AXNode = raw.root
    ? assignUids(raw.root, snapshotId, uidToNode)
    : { uid: `${snapshotId}_0`, role: 'AXApplication', children: [] }

  if (!raw.root) {
    uidToNode.set(root.uid, root)
  }

  return {
    snapshotId,
    pid: raw.pid,
    appName: raw.appName,
    root,
    uidToNode,
    capturedAt: new Date().toISOString(),
    maxDepth: request.maxDepth ?? 15,
    truncated: raw.truncated,
  }
}

/**
 * Format an AXSnapshot as an indented text tree suitable for LLM context.
 */
export function formatAXSnapshotAsText(
  snapshot: AXSnapshot,
  options: AXSnapshotTextOptions = {},
): string {
  const indent = options.indent ?? '  '
  const includeBounds = options.includeBounds ?? false
  const includeUids = options.includeUids ?? true

  const lines: string[] = []
  lines.push(`[AXTree] ${snapshot.appName} (pid ${snapshot.pid})${snapshot.truncated ? ' [TRUNCATED]' : ''}`)

  function walk(node: AXNode, depth: number) {
    const prefix = indent.repeat(depth)
    const parts: string[] = []

    if (includeUids) {
      parts.push(`[${node.uid}]`)
    }

    parts.push(node.role || '(no role)')

    if (node.title) {
      parts.push(`"${node.title}"`)
    }
    if (node.value) {
      const truncated = node.value.length > 80 ? `${node.value.slice(0, 77)}...` : node.value
      parts.push(`val="${truncated}"`)
    }
    if (node.description) {
      parts.push(`desc="${node.description}"`)
    }
    if (node.focused) {
      parts.push('[focused]')
    }
    if (node.enabled === false) {
      parts.push('[disabled]')
    }
    if (includeBounds && node.bounds) {
      const b = node.bounds
      parts.push(`@(${b.x},${b.y} ${b.width}x${b.height})`)
    }

    lines.push(`${prefix}${parts.join(' ')}`)

    for (const child of node.children) {
      walk(child, depth + 1)
    }
  }

  walk(snapshot.root, 0)
  return lines.join('\n')
}

/**
 * Find a node by uid in the snapshot.
 */
export function findAXNodeByUid(snapshot: AXSnapshot, uid: string): AXNode | undefined {
  return snapshot.uidToNode.get(uid)
}
