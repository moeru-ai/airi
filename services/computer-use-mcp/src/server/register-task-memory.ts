import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { textContent } from './content'

/**
 * Register task memory MCP tools on the server.
 *
 * - `task_memory_update`: LLM calls this to write/merge task execution state.
 * - `task_memory_get`: LLM calls this to read the current task memory snapshot.
 * - `task_memory_clear`: LLM calls this to reset task memory.
 */
export function registerTaskMemoryTools(server: McpServer, runtime: ComputerUseServerRuntime) {
  // ------------------------------------------------------------------
  // task_memory_update
  // ------------------------------------------------------------------
  server.tool(
    'task_memory_update',
    {
      status: z.enum(['active', 'blocked', 'done']).optional().describe('Task status'),
      goal: z.string().optional().describe('High-level task goal'),
      currentStep: z.string().optional().describe('What is being done right now'),
      confirmedFacts: z.array(z.string()).optional().describe('Facts confirmed with evidence'),
      artifacts: z.array(z.object({
        label: z.string().describe('Short human-readable label'),
        value: z.string().describe('Artifact value (path, URL, or short text)'),
        kind: z.enum(['file', 'url', 'tool', 'note']).describe('Artifact category'),
      })).optional().describe('Key artifacts produced'),
      blockers: z.array(z.string()).optional().describe('What is blocking progress'),
      nextStep: z.string().optional().describe('What to do next'),
      plan: z.array(z.string()).optional().describe('Ordered plan steps'),
      workingAssumptions: z.array(z.string()).optional().describe('Unconfirmed assumptions'),
      recentFailureReason: z.string().optional().describe('Why the last attempt failed'),
      completionCriteria: z.array(z.string()).optional().describe('How to know when done'),
      newTask: z.boolean().optional().describe('Set true ONLY if starting a clearly different task/goal'),
      sourceTurnId: z.string().min(1).describe('Stable identifier of the completed turn producing this update'),
      sourceTurnIndex: z.number().int().nonnegative().describe('Monotonic index of the completed turn within the session'),
    },
    async (params, _extra) => {
      const result = runtime.taskMemory.update(
        {
          status: params.status,
          goal: params.goal,
          currentStep: params.currentStep,
          confirmedFacts: params.confirmedFacts,
          artifacts: params.artifacts,
          blockers: params.blockers,
          nextStep: params.nextStep,
          plan: params.plan,
          workingAssumptions: params.workingAssumptions,
          recentFailureReason: params.recentFailureReason,
          completionCriteria: params.completionCriteria,
          newTask: params.newTask,
        },
        {
          sourceTurnId: params.sourceTurnId,
          sourceTurnIndex: params.sourceTurnIndex,
        },
      )

      if (result.status === 'updated') {
        const { taskMemory: merged } = result
        // Sync to run state so other tools can see it via summarizeRunState
        runtime.stateManager.updateTaskMemory(merged)

        return {
          content: [textContent(`Task memory updated [${merged.status}]${merged.goal ? `: ${merged.goal}` : ''}`)],
          structuredContent: { ...merged } as Record<string, unknown>,
        }
      }

      if (result.status === 'ignored-stale') {
        return {
          content: [textContent(`Task memory update ignored as stale. Latest observed turn is ${result.latestSourceTurnId ?? 'unknown'}${result.latestSourceTurnIndex !== undefined ? ` (#${result.latestSourceTurnIndex})` : ''}.`)],
        }
      }

      return {
        content: [textContent('Task memory update had no meaningful content to persist.')],
      }
    },
  )

  // ------------------------------------------------------------------
  // task_memory_get
  // ------------------------------------------------------------------
  server.tool(
    'task_memory_get',
    {},
    async (_params, _extra) => {
      const tm = runtime.taskMemory.get()
      if (!tm) {
        return {
          content: [textContent('No active task memory. Use task_memory_update to start tracking a task.')],
        }
      }

      return {
        content: [textContent(runtime.taskMemory.toContextString())],
        structuredContent: { ...tm } as Record<string, unknown>,
      }
    },
  )

  // ------------------------------------------------------------------
  // task_memory_clear
  // ------------------------------------------------------------------
  server.tool(
    'task_memory_clear',
    {},
    async (_params, _extra) => {
      runtime.taskMemory.clear()
      runtime.stateManager.clearTaskMemory()
      return {
        content: [textContent('Task memory cleared.')],
      }
    },
  )
}
