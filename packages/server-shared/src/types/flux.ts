/**
 * One display record. For a TTS round, amount is the total debit.
 * Other fields describe the latest ledger entry in that round.
 */
export interface FluxHistoryEntry {
  id: string
  userId: string
  type: string
  amount: number
  /** Actual balances around the latest debit, not around the round total. */
  balanceBefore: number
  balanceAfter: number
  requestId: string | null
  description: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** The existing history response. The offset counts display records. */
export interface FluxHistoryPage {
  records: FluxHistoryEntry[]
  hasMore: boolean
}
