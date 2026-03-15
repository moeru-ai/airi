/**
 * macOS Accessibility tree capture via Swift + AXUIElement API.
 *
 * This module provides tools to inspect the accessibility hierarchy (AXTree) of macOS applications.
 * It works by:
 *
 * 1. **Swift Script Execution**: Runs a native Swift script (`ax-tree.swift`) that directly calls
 *    the macOS Accessibility API (ApplicationServices/AXUIElement).
 *    - The Swift script walks the accessibility tree recursively from the root application element.
 *    - It captures attributes like role, title, value, bounds, focus state, and enabled status.
 *    - It terminates early if depth or node limits are exceeded.
 *
 * 2. **IPC via Environment Variable**: The TypeScript code passes query parameters to the Swift script
 *    through the `COMPUTER_USE_SWIFT_STDIN` environment variable as JSON.
 *
 * 3. **Tree Structure**: The Swift script returns a JSON tree with:
 *    - `pid`: Process ID of the target app
 *    - `appName`: Human-readable application name
 *    - `root`: The accessibility tree root node
 *    - `truncated`: Whether the tree was truncated (hit depth or node limit)
 *
 * 4. **UID Assignment**: Each node in the tree is assigned a stable unique ID (`uid`) for quick lookup.
 *    A flat map (`uidToNode`) is built to enable O(1) node retrieval by UID.
 *
 * 5. **Formatting**: The tree can be formatted as a readable text representation for LLM context,
 *    including optional role, value, bounds, and focus state annotations.
 *
 * ## Usage Example
 *
 * ```typescript
 * import { captureAXTree, formatAXSnapshotAsText, findAXNodeByUid } from './ax-tree'
 *
 * // Capture the frontmost app's accessibility tree
 * const snapshot = await captureAXTree(config)
 * console.log(`Captured ${Object.keys(snapshot.uidToNode).length} nodes from ${snapshot.appName}`)
 *
 * // Format as text for display/logging
 * const textTree = formatAXSnapshotAsText(snapshot, { includeBounds: true })
 * console.log(textTree)
 *
 * // Find a specific node by UID
 * const node = findAXNodeByUid(snapshot, 'snapshot123_45')
 * if (node?.focused) console.log('Found focused node:', node.title)
 * ```
 *
 * ## Platform Support
 *
 * Only available on **macOS**. Throws an error if called on other platforms.
 * Requires `/usr/bin/swift` to be present and the app to grant Accessibility permission.
 *
 * @see ax-tree.swift - The native Swift script that performs the actual tree walk.
 */

import type { ComputerUseConfig } from '../types'
import type { AXNode, AXSnapshot, AXSnapshotRequest, AXSnapshotTextOptions } from './types'

import { readFileSync } from 'node:fs'
import { platform } from 'node:process'

import { runSwiftScript } from '../utils/swift'

let nextSnapshotId = 1

// NOTICE: This package runs under Node/tsx in development, not Vite browser bundling.
// Loading the Swift source via `?raw` breaks `tsx` with `ERR_UNKNOWN_FILE_EXTENSION`.
// Read the sibling file directly so the script still lives in its own file while
// remaining compatible with the actual runtime path used by computer-use-mcp.
const axTreeScript = readFileSync(new URL('./ax-tree.swift', import.meta.url), 'utf8')

/**
 * Raw node structure returned by the Swift script.
 *
 * Represents a single accessibility element in the tree.
 *
 * @internal
 */
interface RawAXNode {
  /** Role of the element (e.g., "AXWindow", "AXButton", "AXTextField") */
  role: string
  /** Title/label of the element */
  title?: string
  /** Current value (text input content, slider position, etc.) */
  value?: string
  /** Description attribute */
  description?: string
  /** Whether the element is enabled/disabled */
  enabled?: boolean
  /** Whether the element has keyboard focus */
  focused?: boolean
  /** Screen coordinates: { x, y, width, height } in pixels */
  bounds?: { x: number, y: number, width: number, height: number }
  /** Child accessibility elements */
  children?: RawAXNode[]
}

/**
 * Raw output structure from the Swift script.
 *
 * @internal
 */
interface RawAXOutput {
  /** Process ID of the application */
  pid: number
  /** Human-readable application name */
  appName: string
  /** Root node of the accessibility tree (undefined if app has no accessibility support) */
  root?: RawAXNode
  /** Whether the tree was truncated (hit depth or node limits) */
  truncated: boolean
}

/**
 * Assign stable, unique identifiers to each node in the tree and build a flat lookup table.
 *
 * Each UID is formatted as `{snapshotId}_{counter}` for quick identification and retrieval.
 *
 * @param raw - The raw node tree from Swift
 * @param snapshotId - Unique snapshot identifier (e.g., "1", "234")
 * @param uidToNode - Map to populate with uid -> node mappings for O(1) lookup
 * @returns The transformed node with UIDs assigned recursively to all children
 * @internal
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
 * Capture the accessibility tree of the frontmost (or specified) macOS application.
 *
 * Executes the native Swift script to walk the accessibility hierarchy (AX tree) of a target app.
 * The tree structure is then transformed with stable UIDs and packed into an `AXSnapshot`.
 *
 * ## How it Works
 *
 * 1. Validates that the current platform is macOS (throws error otherwise).
 * 2. Constructs input parameters (max depth, node limits, target PID).
 * 3. Calls `runSwiftScript()` to invoke the Swift script with the parameters via environment variable.
 * 4. Parses the JSON output from Swift.
 * 5. Assigns stable UIDs to each node and builds a flat lookup table.
 * 6. Returns a complete `AXSnapshot` with tree and metadata.
 *
 * ## Performance Considerations
 *
 * - Large trees can be expensive to walk. Use `request.maxDepth` and `request.maxNodes` to limit.
 * - The tree is fully materialized in memory. Truncated trees have `snapshot.truncated === true`.
 * - UID assignment traverses the entire tree once; subsequent lookups via `findAXNodeByUid()` are O(1).
 *
 * @param config - Computer use configuration (Swift binary path, timeouts, etc.)
 * @param request - Optional capture request with target PID, depth/node limits, and verbosity.
 *   - `pid`: Process ID to target (if unset, uses frontmost app)
 *   - `maxDepth`: Maximum tree depth (default: 15)
 *   - `maxNodes`: Maximum number of nodes to capture (default: 2000)
 *   - `verbose`: Include all nodes even if empty (default: false)
 * @returns A complete `AXSnapshot` with tree, flat lookup map, and metadata.
 * @throws Error if not running on macOS.
 *
 * @example
 * ```typescript
 * const snapshot = await captureAXTree(config)
 * console.log(`Root app: ${snapshot.appName} (${snapshot.root.children.length} top-level children)`)
 * console.log(`Total nodes: ${snapshot.uidToNode.size}`)
 * ```
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
    source: axTreeScript,
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
 * Format an `AXSnapshot` as a human-readable indented text tree.
 *
 * Useful for:
 * - Displaying the tree structure in logs or debug output
 * - Preparing tree data for LLM context (passing to an AI model)
 * - Inspecting the accessibility hierarchy in a compact format
 *
 * Each line shows:
 * - `[uid]`: Optional unique identifier (if `includeUids: true`)
 * - Role (e.g., "AXButton", "AXTextField")
 * - Title/label text
 * - Value (e.g., text input content) with truncation to 80 chars
 * - Description (if present)
 * - `[focused]`: If the element has keyboard focus
 * - `[disabled]`: If the element is disabled
 * - `@(x,y widthxheight)`: Screen bounds in pixels (if `includeBounds: true`)
 *
 * @param snapshot - The accessibility tree snapshot to format
 * @param options - Formatting options:
 *   - `indent`: String to use for each indentation level (default: "  ")
 *   - `includeBounds`: Include element screen coordinates (default: false)
 *   - `includeUids`: Include element UIDs in brackets (default: true)
 * @returns Multi-line string representation of the tree
 *
 * @example
 * ```typescript
 * const text = formatAXSnapshotAsText(snapshot, { includeBounds: true })
 * console.log(text)
 *
 * // Output:
 * // [AXTree] Finder (pid 1234)
 * //   [snapshot0_0] AXApplication "Finder"
 * //     [snapshot0_1] AXWindow "Desktop" @(0,0 1920x1080)
 * //       [snapshot0_2] AXButton "New Folder" [enabled]
 * ```
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
 * Look up a node in the snapshot by its unique identifier (UID).
 *
 * This is an O(1) operation because nodes are indexed in a flat map.
 *
 * @param snapshot - The accessibility tree snapshot
 * @param uid - The unique identifier of the node (format: `{snapshotId}_{counter}`)
 * @returns The node if found, undefined otherwise
 *
 * @example
 * ```typescript
 * const node = findAXNodeByUid(snapshot, 'snapshot0_5')
 * if (node) {
 *   console.log(`Found: ${node.title} (role: ${node.role})`)
 *   if (node.children.length > 0) {
 *     console.log(`Has ${node.children.length} children`)
 *   }
 * }
 * ```
 */
export function findAXNodeByUid(snapshot: AXSnapshot, uid: string): AXNode | undefined {
  return snapshot.uidToNode.get(uid)
}
