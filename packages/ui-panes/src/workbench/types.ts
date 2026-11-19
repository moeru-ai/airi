/** How the workbench acts as the title bar of a window that has no title bar of its own. */
export interface WorkbenchFrame {
  /** The space at the start of the top-left tab bar, as a CSS length. The macOS traffic lights sit there. */
  insetStart?: string
  /** The empty part of each tab bar at the top edge moves the window. */
  draggable?: boolean
}
