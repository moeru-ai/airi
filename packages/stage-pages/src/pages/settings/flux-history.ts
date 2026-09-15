// NOTICE:
// This file declares the Flux history response instead of using Hono InferResponseType.
// The generated client type exceeds the TypeScript recursion limit for this route.
// Source: packages/stage-pages/src/pages/settings/flux.vue.
// Remove this interface when the generated client type compiles for the route.
export interface FluxAuditRecord {
  id: string
  type: string
  amount: number
  description: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type GroupedFluxHistoryRow = {
  type: 'single'
  record: FluxAuditRecord
} | {
  type: 'group'
  key: string
  description: string
  count: number
  totalAmount: number
  firstTime: string
  lastTime: string
  records: FluxAuditRecord[]
}

function ttsRoundId(record: FluxAuditRecord): string | undefined {
  if (record.type !== 'debit' || record.description !== 'tts_request')
    return undefined

  const roundId = record.metadata?.roundId
  return typeof roundId === 'string' && roundId.length > 0 ? roundId : undefined
}

/**
 * Groups TTS ledger entries that belong to one chat round.
 *
 * The original entries stay available under `records`. Entries without a
 * round ID stay separate because the UI cannot safely infer their owner.
 */
export function groupFluxHistory(records: FluxAuditRecord[]): GroupedFluxHistoryRow[] {
  const rows: GroupedFluxHistoryRow[] = []
  const groups = new Map<string, Extract<GroupedFluxHistoryRow, { type: 'group' }>>()

  for (const record of records) {
    const roundId = ttsRoundId(record)
    if (roundId == null) {
      rows.push({ type: 'single', record })
      continue
    }

    const existing = groups.get(roundId)
    if (existing) {
      existing.count += 1
      existing.totalAmount += record.amount
      existing.firstTime = record.createdAt
      existing.records.push(record)
      continue
    }

    const group: Extract<GroupedFluxHistoryRow, { type: 'group' }> = {
      type: 'group',
      key: `tts-round-${roundId}`,
      description: record.description,
      count: 1,
      totalAmount: record.amount,
      firstTime: record.createdAt,
      lastTime: record.createdAt,
      records: [record],
    }
    groups.set(roundId, group)
    rows.push(group)
  }

  return rows.map(row => row.type === 'group' && row.count === 1
    ? { type: 'single', record: row.records[0] }
    : row)
}
