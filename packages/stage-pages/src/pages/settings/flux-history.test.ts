import { describe, expect, it } from 'vitest'

import { groupFluxHistory } from './flux-history'

function record(input: {
  id: string
  roundId?: string
  type?: string
  description?: string
  amount?: number
  createdAt?: string
}) {
  return {
    id: input.id,
    type: input.type ?? 'debit',
    amount: input.amount ?? 1,
    description: input.description ?? 'tts_request',
    metadata: input.roundId == null ? null : { roundId: input.roundId },
    createdAt: input.createdAt ?? '2026-09-08T12:00:00.000Z',
  }
}

describe('groupFluxHistory', () => {
  // ROOT CAUSE:
  //
  // The history page matched `tts:` while the ledger writes `tts_request`.
  // It also had no chat-round key, so repeated `-1` entries stayed separate.
  // A description-only fix could merge adjacent entries from different replies.
  // The server now stores the chat round ID on each TTS debit.
  it('groups all loaded TTS debits for one chat round', () => {
    const rows = groupFluxHistory([
      record({ id: 'tts-2', roundId: 'round-1', createdAt: '2026-09-08T12:00:02.000Z' }),
      record({ id: 'chat', description: 'llm_request', amount: 3 }),
      record({ id: 'tts-1', roundId: 'round-1', createdAt: '2026-09-08T12:00:01.000Z' }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      type: 'group',
      key: 'tts-round-round-1',
      count: 2,
      totalAmount: 2,
      firstTime: '2026-09-08T12:00:01.000Z',
      lastTime: '2026-09-08T12:00:02.000Z',
    })
    expect(rows[1]).toEqual({ type: 'single', record: expect.objectContaining({ id: 'chat' }) })
  })

  it('keeps different chat rounds isolated', () => {
    const rows = groupFluxHistory([
      record({ id: 'a-2', roundId: 'round-a' }),
      record({ id: 'b-2', roundId: 'round-b' }),
      record({ id: 'a-1', roundId: 'round-a' }),
      record({ id: 'b-1', roundId: 'round-b' }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: 'group', key: 'tts-round-round-a', count: 2 })
    expect(rows[1]).toMatchObject({ type: 'group', key: 'tts-round-round-b', count: 2 })
  })

  it('keeps legacy TTS debits without a round ID separate', () => {
    const rows = groupFluxHistory([
      record({ id: 'legacy-2' }),
      record({ id: 'legacy-1' }),
    ])

    expect(rows).toEqual([
      { type: 'single', record: expect.objectContaining({ id: 'legacy-2' }) },
      { type: 'single', record: expect.objectContaining({ id: 'legacy-1' }) },
    ])
  })
})
