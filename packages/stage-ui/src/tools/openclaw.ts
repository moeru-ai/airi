import type { WebSocketEvents } from '@proj-airi/server-sdk'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { tool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const openClawMetadataSchema = z.object({
  conversationId: z.string().optional().describe('Stable conversation or session identifier for the delegated OpenClaw task.'),
  replyDestinations: z.array(z.string()).optional().describe('Optional destinations that should receive OpenClaw result updates.'),
  returnMode: z.enum(['structured', 'summary']).optional().describe('Whether OpenClaw should return structured output or a plain summary.'),
  source: z.string().optional().describe('Short source tag describing who delegated the task.'),
  userId: z.string().optional().describe('User or actor identifier associated with the delegated task.'),
}).strict()

const openClawContextSchema = z.object({
  lane: z.string().optional().describe('Logical lane for extra context attached to the task.'),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe('JSON-like metadata for the extra context item.'),
  text: z.string().describe('Context text to include with the delegated task.'),
}).strict()

export const openClawToolSchema = z.object({
  ack: z.string().optional().describe('Optional acknowledgement shown to the receiver.'),
  conversationId: z.string().describe('Stable conversation or session identifier for the delegated OpenClaw task.'),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional().describe('Priority of the delegated task.'),
  replyDestinations: z.array(z.string()).optional().describe('Optional destinations that should receive OpenClaw result updates.'),
  returnMode: z.enum(['structured', 'summary']).optional().describe('Whether OpenClaw should return structured output or a plain summary.'),
  source: z.string().optional().describe('Short source tag describing who delegated the task.'),
  task: z.string().min(1).describe('The concrete task that OpenClaw should perform.'),
  taskContexts: z.array(openClawContextSchema).optional().describe('Additional context items that should travel with the delegated task.'),
  target: z.string().optional().describe('The spark command destination for the OpenClaw bridge module.'),
  userId: z.string().describe('User or actor identifier associated with the delegated task.'),
}).strict()

export type OpenClawToolPayload = z.infer<typeof openClawToolSchema>

const EXPLICIT_OPENCLAW_TASK_PREFIXES = [
  '請用 OpenClaw 執行這個任務',
  '請用 OpenClaw 執行任務',
  '請交給 OpenClaw 處理',
  '這是一個要交給 OpenClaw 的任務',
] as const

const EXPLICIT_OPENCLAW_TASK_SPLIT_PATTERN = /[：:]/

export interface OpenClawToolResult {
  error?: {
    message?: string
  }
  result?: {
    structuredOutput?: Record<string, unknown>
    summary?: string
  }
  status: 'completed' | 'failed' | 'cancelled'
  summary: string
}

export function extractExplicitOpenClawTask(message: string): string | undefined {
  const trimmedMessage = message.trim()

  for (const prefix of EXPLICIT_OPENCLAW_TASK_PREFIXES) {
    if (!trimmedMessage.startsWith(prefix)) {
      continue
    }

    const [, ...rest] = trimmedMessage.split(EXPLICIT_OPENCLAW_TASK_SPLIT_PATTERN)
    const task = rest.join(':').trim()
    if (task)
      return task
  }

  return undefined
}

function buildOpenClawMetadata(payload: OpenClawToolPayload) {
  return {
    conversationId: payload.conversationId,
    replyDestinations: payload.replyDestinations,
    returnMode: payload.returnMode ?? 'structured',
    source: payload.source ?? 'stage-ui:openclaw-tool',
    taskText: payload.task,
    userId: payload.userId,
  }
}

export function buildOpenClawSparkCommand(payload: OpenClawToolPayload): WebSocketEvents['spark:command'] {
  const openclaw = buildOpenClawMetadata(payload)

  return {
    id: nanoid(),
    eventId: nanoid(),
    commandId: nanoid(),
    interrupt: false,
    priority: payload.priority ?? 'normal',
    intent: 'action',
    ack: payload.ack ?? `Delegate task to OpenClaw: ${payload.task}`,
    contexts: [
      {
        id: nanoid(),
        contextId: nanoid(),
        lane: 'openclaw:task',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: payload.task,
        metadata: {
          openclaw,
        },
      },
      ...(payload.taskContexts ?? []).map(context => ({
        id: nanoid(),
        contextId: nanoid(),
        lane: context.lane,
        strategy: ContextUpdateStrategy.AppendSelf,
        text: context.text,
        metadata: context.metadata,
      })),
    ],
    destinations: [payload.target ?? 'openclaw-bridge'],
  }
}

function formatOpenClawToolResult(result: OpenClawToolResult) {
  if (result.status === 'completed') {
    return result.summary
  }

  return `OpenClaw task ${result.status}: ${result.error?.message ?? result.summary}`
}

export async function executeOpenClawTool(
  payload: OpenClawToolPayload,
  sendSparkCommand: (command: WebSocketEvents['spark:command']) => void | Promise<void>,
  waitForOpenClawResult?: (commandId: string, payload: OpenClawToolPayload) => Promise<OpenClawToolResult>,
) {
  const command = buildOpenClawSparkCommand(payload)

  if (waitForOpenClawResult) {
    const resultPromise = waitForOpenClawResult(command.commandId, payload)
    await sendSparkCommand(command)
    return formatOpenClawToolResult(await resultPromise)
  }

  await sendSparkCommand(command)
  return `Delegated OpenClaw task via spark:command (${command.commandId}) to ${command.destinations.join(', ')}`
}

export async function openclaw(
  sendSparkCommand: (command: WebSocketEvents['spark:command']) => void | Promise<void>,
  waitForOpenClawResult?: (commandId: string, payload: OpenClawToolPayload) => Promise<OpenClawToolResult>,
) {
  return [
    await tool({
      name: 'delegate_openclaw_task',
      description: 'Delegate a task to the AIRI OpenClaw bridge through spark:command using the existing server-channel path, then wait for the final OpenClaw result.',
      parameters: openClawToolSchema,
      execute: async payload => executeOpenClawTool(payload, sendSparkCommand, waitForOpenClawResult),
    }),
  ]
}

export { openClawContextSchema, openClawMetadataSchema }
