import { describe, expect, it } from 'vitest'

import { createVoiceInputTranscriptionChain } from './voice-input-transcription-chain'

describe('createVoiceInputTranscriptionChain', () => {
  it('runs queued transcriptions in order while the session stays current', async () => {
    const chain = createVoiceInputTranscriptionChain()
    const resolved: string[] = []

    let finishFirst!: () => void
    const first = chain.enqueue(async () => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      resolved.push('first')
    })
    const second = chain.enqueue(async () => {
      resolved.push('second')
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(resolved).toEqual([])

    finishFirst()
    await first
    await second

    expect(resolved).toEqual(['first', 'second'])
  })

  it('lets fresh transcriptions start after reset without waiting for stale provider work', async () => {
    const chain = createVoiceInputTranscriptionChain()
    const resolved: string[] = []

    void chain.enqueue(async () => {
      await new Promise<void>(() => {})
      resolved.push('stale')
    })

    await Promise.resolve()
    chain.reset()

    await chain.enqueue(async (ticket) => {
      expect(ticket.isCurrent()).toBe(true)
      resolved.push('fresh')
    })

    expect(resolved).toEqual(['fresh'])
  })

  it('marks running tickets stale after reset so late results cannot publish', async () => {
    const chain = createVoiceInputTranscriptionChain()
    let finishFirst!: () => void
    let firstTicketStillCurrent = true

    const first = chain.enqueue(async (ticket) => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      firstTicketStillCurrent = ticket.isCurrent()
    })

    await Promise.resolve()
    chain.reset()
    finishFirst()
    await first

    expect(firstTicketStillCurrent).toBe(false)
  })
})
