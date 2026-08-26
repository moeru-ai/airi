/**
 * Accessibility Tool Descriptors
 */

import type { ToolDescriptor } from './types'

export const accessibilityDescriptors: ToolDescriptor[] = [
  {
    canonicalName: 'accessibility_snapshot',
    concurrencySafe: true,
    defaultDeferred: true,
    destructive: false,
    displayName: 'Accessibility Snapshot',
    kind: 'read',
    lane: 'accessibility',
    public: true,
    readOnly: true,
    requiresApprovalByDefault: false,
    summary: 'Capture the macOS accessibility tree for the frontmost application or a specific process. Returns a hierarchical snapshot of UI elements with roles, titles, values, and optional bounds.',
  },
  {
    canonicalName: 'accessibility_find_element',
    concurrencySafe: true,
    defaultDeferred: true,
    destructive: false,
    displayName: 'Accessibility Find Element',
    kind: 'read',
    lane: 'accessibility',
    public: true,
    readOnly: true,
    requiresApprovalByDefault: false,
    summary: 'Search the accessibility tree for elements matching a role and/or title pattern. Returns matching elements with their UIDs, roles, titles, values, and bounds.',
  },
]
