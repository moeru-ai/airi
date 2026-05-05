/**
 * Task Memory Tool Descriptors
 */

import type { ToolDescriptor } from './types'

export const taskMemoryDescriptors: ToolDescriptor[] = [
  {
    canonicalName: 'task_memory_update',
    displayName: 'Task Memory Update',
    summary: 'Write or merge task execution state including goal, current step, confirmed facts, artifacts, blockers, and plan.',
    lane: 'task_memory',
    kind: 'memory',
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApprovalByDefault: false,
    public: true,
    defaultDeferred: true,
  },
  {
    canonicalName: 'task_memory_get',
    displayName: 'Task Memory Get',
    summary: 'Read the current task memory snapshot. Returns the full task execution state.',
    lane: 'task_memory',
    kind: 'memory',
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApprovalByDefault: false,
    public: true,
    defaultDeferred: true,
  },
  {
    canonicalName: 'task_memory_clear',
    displayName: 'Task Memory Clear',
    summary: 'Reset all task memory and execution state. Clears goals, steps, facts, and artifacts.',
    lane: 'task_memory',
    kind: 'memory',
    readOnly: false,
    destructive: true,
    concurrencySafe: false,
    requiresApprovalByDefault: false,
    public: true,
    defaultDeferred: true,
  },
]
