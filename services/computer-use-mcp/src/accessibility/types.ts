/**
 * Accessibility tree types for native macOS UI grounding.
 *
 * Uses the macOS Accessibility API (AXUIElement) via Swift to query the
 * AXTree of the focused application. This provides semantic structure
 * (roles, labels, values, bounds) that complements pixel-based screenshots.
 */

export interface AXNode {
  /** Stable uid for this node within the snapshot */
  uid: string
  role: string
  title?: string
  value?: string
  description?: string
  /** Whether the element can receive focus / interaction */
  enabled?: boolean
  focused?: boolean
  /** Screen-coordinate bounding rect */
  bounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  children: AXNode[]
}

export interface AXSnapshot {
  /** Unique id for this snapshot (monotonically increasing) */
  snapshotId: string
  /** PID of the app whose tree was captured */
  pid: number
  /** Application name */
  appName: string
  /** Root of the AXTree */
  root: AXNode
  /** Flat lookup table: uid → node */
  uidToNode: Map<string, AXNode>
  /** When the snapshot was taken */
  capturedAt: string
  /** Max depth used during capture */
  maxDepth: number
  /** Whether the tree was truncated due to depth/node limits */
  truncated: boolean
}

export interface AXSnapshotRequest {
  /** Target a specific PID instead of frontmost app */
  pid?: number
  /** Maximum tree depth to traverse (default: 15) */
  maxDepth?: number
  /** Maximum total nodes to collect (default: 2000) */
  maxNodes?: number
  /** Whether to include nodes with empty roles/titles (default: false) */
  verbose?: boolean
}

export interface AXSnapshotTextOptions {
  /** Indentation string per level */
  indent?: string
  /** Whether to include bounds info */
  includeBounds?: boolean
  /** Whether to include uid annotations */
  includeUids?: boolean
}
