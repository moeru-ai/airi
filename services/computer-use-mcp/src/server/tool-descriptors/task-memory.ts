/**
 * Task Memory Tool Descriptors
 */

import type { ToolDescriptor } from './types'

export const taskMemoryDescriptors: ToolDescriptor[] = [
  {
    canonicalName: 'task_memory_update',
    concurrencySafe: false,
    defaultDeferred: true,
    destructive: false,
    displayName: 'Task Memory Update',
    kind: 'memory',
    lane: 'task_memory',
    public: true,
    readOnly: false,
    requiresApprovalByDefault: false,
    summary: 'Write or merge task execution state including goal, current step, confirmed facts, artifacts, blockers, and plan.',
  },
  {
    canonicalName: 'task_memory_get',
    concurrencySafe: true,
    defaultDeferred: true,
    destructive: false,
    displayName: 'Task Memory Get',
    kind: 'memory',
    lane: 'task_memory',
    public: true,
    readOnly: true,
    requiresApprovalByDefault: false,
    summary: 'Read the current task memory snapshot. Returns the full task execution state.',
  },
  {
    canonicalName: 'task_memory_clear',
    concurrencySafe: false,
    defaultDeferred: true,
    destructive: true,
    displayName: 'Task Memory Clear',
    kind: 'memory',
    lane: 'task_memory',
    public: true,
    readOnly: false,
    requiresApprovalByDefault: false,
    summary: 'Reset all task memory and execution state. Clears goals, steps, facts, and artifacts.',
  },
]
