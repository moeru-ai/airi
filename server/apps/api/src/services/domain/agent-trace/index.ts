import type { Database } from '../../../libs/db'
import type { AgentTraceUpload } from '../../../routes/agent-traces/schema'

import { useLogger } from '@guiiai/logg'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { agentRun, agentTraceSpan } from '../../../schemas/agent-trace'
import { refreshAgentRun } from './run'
import { toSpanRows } from './spans'

export function createAgentTraceService(db: Database) {
  const logger = useLogger('agent-trace').useGlobalConfig()

  return {
    /**
     * Stores the known spans of an upload and refreshes the summary of each turn that the upload touches.
     *
     * A span that was stored before is not stored again, so a client can send a batch two times.
     */
    async ingest(userId: string, upload: AgentTraceUpload) {
      const { rows, droppedSpans, droppedAttributes } = toSpanRows(upload)
      if (droppedSpans > 0 || droppedAttributes > 0)
        logger.withFields({ droppedSpans, droppedAttributes, appVersion: upload.resource.appVersion }).warn('Dropped agent trace data outside the allowlist')
      if (rows.length === 0)
        return { accepted: 0, droppedSpans, droppedAttributes }

      const receivedAt = new Date()
      await db.insert(agentTraceSpan).values(rows.map(row => ({ ...row, userId, receivedAt }))).onConflictDoNothing({
        target: [agentTraceSpan.userId, agentTraceSpan.traceId, agentTraceSpan.spanId],
      })

      // A span joins its turn through its trace, so a voice input span sent before its turn span still reaches the turn later.
      const traceIds = [...new Set(rows.map(row => row.traceId))]
      const turns = await db.selectDistinct({ interactionId: agentTraceSpan.interactionId }).from(agentTraceSpan).where(and(
        eq(agentTraceSpan.userId, userId),
        inArray(agentTraceSpan.traceId, traceIds),
        eq(agentTraceSpan.kind, 'turn'),
        isNotNull(agentTraceSpan.interactionId),
      ))
      for (const turn of turns) {
        if (turn.interactionId)
          await refreshAgentRun(db, userId, turn.interactionId)
      }
      return { accepted: rows.length, droppedSpans, droppedAttributes }
    },

    async deleteAllForUser(userId: string) {
      await db.transaction(async (tx) => {
        await tx.delete(agentTraceSpan).where(eq(agentTraceSpan.userId, userId))
        await tx.delete(agentRun).where(eq(agentRun.userId, userId))
      })
    },
  }
}

export type AgentTraceService = ReturnType<typeof createAgentTraceService>
