/** One immutable Flux ledger entry returned by the history API. */
export interface FluxHistoryEntry {
  id: string
  type: string
  amount: number
  description: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** One ledger entry that has no safe TTS round grouping key. */
export interface FluxHistorySingleRow {
  type: 'single'
  record: FluxHistoryEntry
}

/** TTS ledger entries that share one validated conversation and round. */
export interface FluxHistoryGroupRow {
  type: 'group'
  key: string
  conversationId: string
  roundId: string
  description: 'tts_request'
  chargeCount: number
  totalAmount: number
  firstTime: string
  lastTime: string
  entries: FluxHistoryEntry[]
}

/** One row in the server-owned Flux history read model. */
export type FluxHistoryRow = FluxHistorySingleRow | FluxHistoryGroupRow

/** One page of grouped Flux history rows. The offset counts rows, not ledger entries. */
export interface FluxHistoryPage {
  rows: FluxHistoryRow[]
  hasMore: boolean
}
