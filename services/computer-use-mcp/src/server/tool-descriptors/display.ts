/**
 * Display Tool Descriptors
 */

import type { ToolDescriptor } from './types'

export const displayDescriptors: ToolDescriptor[] = [
  {
    canonicalName: 'display_enumerate',
    concurrencySafe: true,
    defaultDeferred: true,
    destructive: false,
    displayName: 'Display Enumerate',
    kind: 'read',
    lane: 'display',
    public: true,
    readOnly: true,
    requiresApprovalByDefault: false,
    summary: 'List all connected displays with their bounds, scale factors, and pixel dimensions. Useful for understanding the coordinate space.',
  },
  {
    canonicalName: 'display_identify_point',
    concurrencySafe: true,
    defaultDeferred: true,
    destructive: false,
    displayName: 'Display Identify Point',
    kind: 'read',
    lane: 'display',
    public: true,
    readOnly: true,
    requiresApprovalByDefault: false,
    summary: 'Identify which display contains a given coordinate and return the local coordinates within that display.',
  },
]
