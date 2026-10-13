import type { Database } from '../../../libs/db'
import type { AgentTraceUpload, AgentTraceUploadSpan } from '../../../routes/agent-traces/schema'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createAgentTraceService } from '.'
import { mockDB } from '../../../libs/mock-db'
import { agentRun, agentTraceSpan } from '../../../schemas/agent-trace'
import { llmRequestAttempt } from '../../../schemas/llm-request-attempt'
import { llmRequestItem } from '../../../schemas/llm-request-item'
import { llmRequestLog } from '../../../schemas/llm-request-log'
import { captureRequestContent } from '../request-content'
import { createRequestLogService } from '../request-log'

const io = 'ai.moeru.airi.io'
const userId = 'trace-user'
const trace = '1'.repeat(32)

function span(spanId: string, name: string, attributes: AgentTraceUploadSpan['attributes'] = {}, rest: Partial<AgentTraceUploadSpan> = {}): AgentTraceUploadSpan {
  return { traceId: trace, spanId: spanId.padStart(16, '0'), name, startTimeUnixMs: Date.UTC(2026, 9, 14), endTimeUnixMs: Date.UTC(2026, 9, 14) + 900, status: 'ok', attributes, ...rest }
}

function upload(...spans: AgentTraceUploadSpan[]): AgentTraceUpload {
  return { resource: { appSurface: 'web' }, spans }
}

const turnSpan = span('1', 'Interaction turn', { [`${io}.turn_id`]: 'round-1', 'gen_ai.conversation.id': 'session-1' })
const voiceSpan = span('2', 'Voice input', { [`${io}.voice_input.trigger`]: 'speech' })
const failedTool = span('3', 'Tool execution', { 'gen_ai.tool.name': 'weather', 'gen_ai.tool.call.id': 'call-1' }, { parentSpanId: '1'.padStart(16, '0'), status: 'error' })

describe('agent trace service', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB({ llmRequestLog, llmRequestAttempt, llmRequestItem, agentTraceSpan, agentRun })
  })
  beforeEach(async () => {
    for (const table of [agentRun, agentTraceSpan, llmRequestItem, llmRequestAttempt, llmRequestLog])
      await db.delete(table)
  })

  async function request(requestId: string, completion: unknown) {
    const logs = createRequestLogService(db)
    const entry = { userId, requestId, model: 'auto', status: 200, durationMs: 100, sessionId: 'session-1', interactionId: 'round-1', promptTokens: 10, completionTokens: 5 }
    await logs.beginRequest({ ...entry, status: 0, durationMs: 0, prompt: captureRequestContent({ messages: [{ role: 'user', content: 'What is the weather?' }] }) })
    await logs.logRequest({ ...entry, completion: captureRequestContent(completion) })
  }

  const toolCall = { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', function: { name: 'weather', arguments: '{}' } }] } }] }

  it('stores a span one time when a client sends the batch again', async () => {
    const traces = createAgentTraceService(db)
    expect(await traces.ingest(userId, upload(turnSpan, voiceSpan))).toEqual({ accepted: 2, droppedSpans: 0, droppedAttributes: 0 })
    await traces.ingest(userId, upload(turnSpan, voiceSpan))
    expect(await db.select().from(agentTraceSpan)).toHaveLength(2)
  })

  it('gives the same run row when requests and spans arrive in any order', async () => {
    const traces = createAgentTraceService(db)
    await traces.ingest(userId, upload(failedTool))
    await request('request-1', toolCall)
    const fromRequests = await db.select().from(agentRun)
    // The model asked for a tool, so the turn runs until the client sends the next request or its turn span.
    expect(fromRequests).toEqual([expect.objectContaining({ status: 'running', endedAt: null, llmCalls: 1, toolCalls: 1, failedTools: 0, hasClientTrace: false, inputTokens: 10, outputTokens: 5 })])

    // The turn span arrives last, and the tool span that came first now joins the turn through the trace.
    await request('request-2', { choices: [{ message: { role: 'assistant', content: 'Sunny' } }] })
    expect(await db.select({ status: agentRun.status }).from(agentRun)).toEqual([{ status: 'finished' }])
    await traces.ingest(userId, upload(turnSpan))
    const [run] = await db.select().from(agentRun)
    expect(run).toMatchObject({ interactionId: 'round-1', sessionId: 'session-1', traceId: trace, status: 'finished', llmCalls: 2, toolCalls: 1, failedTools: 1, hasClientTrace: true, inputTokens: 20, outputTokens: 10 })

    await traces.ingest(userId, upload(turnSpan, failedTool))
    expect(await db.select().from(agentRun)).toEqual([{ ...run, updatedAt: expect.any(Date) }])
  })

  it('keeps a turn running until its request ends, and takes the status of the turn span over the requests', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest({ userId, requestId: 'request-1', model: 'auto', status: 0, durationMs: 0, interactionId: 'round-1' })
    expect(await db.select({ status: agentRun.status, endedAt: agentRun.endedAt }).from(agentRun)).toEqual([{ status: 'running', endedAt: null }])

    await logs.recoverStaleRequests(new Date(Date.now() + 1000))
    expect(await db.select({ status: agentRun.status }).from(agentRun)).toEqual([{ status: 'failed' }])

    await createAgentTraceService(db).ingest(userId, upload({ ...turnSpan, attributes: { ...turnSpan.attributes, [`${io}.cancelled`]: true } }))
    expect(await db.select({ status: agentRun.status }).from(agentRun)).toEqual([{ status: 'cancelled' }])
  })

  it('writes spans only for the signed-in user and deletes both tables for a deleted user', async () => {
    const traces = createAgentTraceService(db)
    await traces.ingest(userId, upload(turnSpan))
    await traces.ingest('other-user', upload(turnSpan))
    expect(await db.select({ userId: agentRun.userId }).from(agentRun).orderBy(agentRun.userId)).toEqual([{ userId: 'other-user' }, { userId }])

    await traces.deleteAllForUser(userId)
    expect(await db.select().from(agentTraceSpan).where(eq(agentTraceSpan.userId, userId))).toHaveLength(0)
    expect(await db.select({ userId: agentRun.userId }).from(agentRun)).toEqual([{ userId: 'other-user' }])
  })
})
