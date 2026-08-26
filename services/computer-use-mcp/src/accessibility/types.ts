/**
 * Accessibility tree types for native macOS UI grounding.
 *
 * Uses the macOS Accessibility API (AXUIElement) via Swift to query the
 * AXTree of the focused application. This provides semantic structure
 * (roles, labels, values, bounds) that complements pixel-based screenshots.
 */

export interface AXNode {
  /** Screen-coordinate bounding rect */
  bounds?: {
    height: number
    width: number
    x: number
    y: number
  }
  children: AXNode[]
  description?: string
  /** Whether the element can receive focus / interaction */
  enabled?: boolean
  focused?: boolean
  role: string
  title?: string
  /** Stable uid for this node within the snapshot */
  uid: string
  value?: string
}

export interface AXSnapshot {
  /** Application name */
  appName: string
  /** When the snapshot was taken */
  capturedAt: string
  /** Max depth used during capture */
  maxDepth: number
  /** PID of the app whose tree was captured */
  pid: number
  /** Root of the AXTree */
  root: AXNode
  /** Unique id for this snapshot (monotonically increasing) */
  snapshotId: string
  /** Whether the tree was truncated due to depth/node limits */
  truncated: boolean
  /** Flat lookup table: uid → node */
  uidToNode: Map<string, AXNode>
}

export interface AXSnapshotRequest {
  /** Maximum tree depth to traverse (default: 15) */
  maxDepth?: number
  /** Maximum total nodes to collect (default: 2000) */
  maxNodes?: number
  /** Target a specific PID instead of frontmost app */
  pid?: number
  /** Whether to include nodes with empty roles/titles (default: false) */
  verbose?: boolean
}

export interface AXSnapshotTextOptions {
  /** Whether to include bounds info */
  includeBounds?: boolean
  /** Whether to include uid annotations */
  includeUids?: boolean
  /** Indentation string per level */
  indent?: string
}
