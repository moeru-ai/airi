/**
 * Accessibility Tool Descriptors
 */

import type { ToolDescriptor } from './types'

export const accessibilityDescriptors: ToolDescriptor[] = [
  {
    canonicalName: 'accessibility_snapshot',
    displayName: 'Accessibility Snapshot',
    summary: 'Capture the macOS accessibility tree for the frontmost application or a specific process. Returns a hierarchical snapshot of UI elements with roles, titles, values, and optional bounds.',
    lane: 'accessibility',
    kind: 'read',
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApprovalByDefault: false,
    public: true,
  },
  {
    canonicalName: 'accessibility_find_element',
    displayName: 'Accessibility Find Element',
    summary: 'Search the accessibility tree for elements matching a role and/or title pattern. Returns matching elements with their UIDs, roles, titles, values, and bounds.',
    lane: 'accessibility',
    kind: 'read',
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApprovalByDefault: false,
    public: true,
  },
]
