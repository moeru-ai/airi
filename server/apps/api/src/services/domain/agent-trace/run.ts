import type { Database } from '../../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, sql } from 'drizzle-orm'

import { agentRun, agentTraceSpan } from '../../../schemas/agent-trace'
import { llmRequestItem } from '../../../schemas/llm-request-item'
import { llmRequestLog } from '../../../schemas/llm-request-log'

const logger = useLogger('agent-run').useGlobalConfig()

type RunStatus = typeof agentRun.$inferSelect.status

const spanStatus: Record<typeof agentTraceSpan.$inferSelect.status, RunStatus> = {
  ok: 'finished',
  error: 'failed',
  cancelled: 'cancelled',
}

function requestStatus(state: string | null): RunStatus {
  if (state === 'completed')
    return 'finished'
  if (state === 'cancelled')
    return 'cancelled'
  return 'failed'
}

/**
 * Computes the summary row of one turn again from its request logs, request items, and client spans.
 *
 * The totals are computed, not added, so a repeated or late write gives the same row.
 * An advisory lock for the turn keeps two writers from storing totals that each miss the other write.
 */
export async function refreshAgentRun(db: Database, userId: string, interactionId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agent_run:${userId}:${interactionId}`}, 0))`)

    const log = llmRequestLog
    const ofTurn = and(eq(log.userId, userId), eq(log.interactionId, interactionId))
    const [requests] = await tx.select({
      calls: sql`count(*)`.mapWith(Number),
      startedAt: sql`min(coalesce(${log.startedAt}, ${log.createdAt}))`.mapWith(log.startedAt),
      endedAt: sql`max(${log.endedAt})`.mapWith(log.endedAt),
      inputTokens: sql`sum(${log.promptTokens})`.mapWith(Number),
      outputTokens: sql`sum(${log.completionTokens})`.mapWith(Number),
      running: sql`coalesce(bool_or(${log.state} = 'running'), false)`.mapWith(Boolean),
      sessionId: sql`max(${log.sessionId})`.mapWith(log.sessionId),
    }).from(log).where(ofTurn)
    const [last] = await tx.select({ state: log.state }).from(log).where(ofTurn).orderBy(desc(sql`coalesce(${log.startedAt}, ${log.createdAt})`), desc(log.id)).limit(1)

    const item = llmRequestItem
    const [items] = await tx.select({
      toolCalls: sql`count(*) filter (where ${item.partType} = 'tool_call')`.mapWith(Number),
      serverToolCalls: sql`count(*) filter (where ${item.partType} = 'server_tool_call')`.mapWith(Number),
    }).from(item).where(and(eq(item.userId, userId), eq(item.interactionId, interactionId), eq(item.direction, 'output')))

    const span = agentTraceSpan
    const [turn] = await tx.select().from(span).where(and(eq(span.userId, userId), eq(span.interactionId, interactionId), eq(span.kind, 'turn'))).orderBy(desc(span.receivedAt)).limit(1)
    const [tools] = turn
      ? await tx.select({ failed: sql`count(*)`.mapWith(Number) }).from(span).where(and(eq(span.userId, userId), eq(span.traceId, turn.traceId), eq(span.kind, 'tool'), eq(span.status, 'error')))
      : [{ failed: 0 }]

    const startedAt = requests.startedAt ?? turn?.startedAt
    if (!startedAt)
      return

    const status: RunStatus = turn ? spanStatus[turn.status] : requests.running ? 'running' : requestStatus(last?.state ?? null)
    const turnEnd = turn?.durationMs == null ? null : new Date(turn.startedAt.getTime() + turn.durationMs)
    const row = {
      userId,
      interactionId,
      sessionId: turn?.sessionId ?? requests.sessionId ?? null,
      traceId: turn?.traceId ?? null,
      status,
      startedAt,
      endedAt: status === 'running' ? null : requests.endedAt ?? turnEnd,
      llmCalls: requests.calls,
      toolCalls: items.toolCalls,
      serverToolCalls: items.serverToolCalls,
      failedTools: tools.failed,
      inputTokens: requests.calls > 0 ? requests.inputTokens : null,
      outputTokens: requests.calls > 0 ? requests.outputTokens : null,
      hasClientTrace: turn !== undefined,
      updatedAt: new Date(),
    }
    await tx.insert(agentRun).values(row).onConflictDoUpdate({ target: [agentRun.userId, agentRun.interactionId], set: row })
  })
}

/**
 * Refreshes the summary of one turn after a request log write.
 *
 * The run row is derived, so a failure is logged and does not fail the request.
 */
export async function refreshAgentRunAfterRequest(db: Database, userId: string, interactionId: string | null) {
  if (!interactionId)
    return
  try {
    await refreshAgentRun(db, userId, interactionId)
  }
  catch (error) {
    logger.withError(error).withFields({ interactionId }).warn('Failed to refresh agent_run')
  }
}
