/**
 * Display Tool Descriptors
 */

import type { ToolDescriptor } from './types'

export const displayDescriptors: ToolDescriptor[] = [
  {
    canonicalName: 'display_enumerate',
    displayName: 'Display Enumerate',
    summary: 'List all connected displays with their bounds, scale factors, and pixel dimensions. Useful for understanding the coordinate space.',
    lane: 'display',
    kind: 'read',
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApprovalByDefault: false,
    public: true,
    defaultDeferred: true,
  },
  {
    canonicalName: 'display_identify_point',
    displayName: 'Display Identify Point',
    summary: 'Identify which display contains a given coordinate and return the local coordinates within that display.',
    lane: 'display',
    kind: 'read',
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApprovalByDefault: false,
    public: true,
    defaultDeferred: true,
  },
]
