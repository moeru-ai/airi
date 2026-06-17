import { describe, expect, it } from 'vitest'

import { createVoiceInputTranscriptionQueue } from './voice-input-transcription-queue'

describe('createVoiceInputTranscriptionQueue', () => {
  it('runs transcription tasks in speech-ready order even when later work would resolve first', async () => {
    const queue = createVoiceInputTranscriptionQueue()
    const resolved: string[] = []

    let finishFirst!: () => void
    const first = queue.enqueue(async () => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      resolved.push('first')
      return 'first'
    })
    const second = queue.enqueue(async () => {
      resolved.push('second')
      return 'second'
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(resolved).toEqual([])

    finishFirst()

    await expect(first).resolves.toBe('first')
    await expect(second).resolves.toBe('second')
    expect(resolved).toEqual(['first', 'second'])
  })

  it('invalidates queued and running tickets when pending work is cleared', async () => {
    const queue = createVoiceInputTranscriptionQueue()
    const resolved: string[] = []
    let firstTicketStillCurrent = true
    let finishFirst!: () => void

    const first = queue.enqueue(async (ticket) => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      firstTicketStillCurrent = ticket.isCurrent()
      resolved.push('first')
    })
    const second = queue.enqueue(async () => {
      resolved.push('second')
    })

    await Promise.resolve()
    queue.clearPending()
    finishFirst()
    await first
    await second

    expect(firstTicketStillCurrent).toBe(false)
    expect(resolved).toEqual(['first'])
  })
})
