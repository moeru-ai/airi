/**
 * One display record. For a TTS round, amount is the total debit.
 * Other fields describe the latest ledger entry in that round.
 */
export interface FluxHistoryEntry {
  id: string
  type: string
  amount: number
  description: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** The existing history response. The offset counts display records. */
export interface FluxHistoryPage {
  records: FluxHistoryEntry[]
  hasMore: boolean
}
