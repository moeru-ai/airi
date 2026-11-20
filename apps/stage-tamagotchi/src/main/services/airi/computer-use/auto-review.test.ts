import { describe, expect, it, vi } from 'vitest'

import { parseAutoApprovalReview } from '../../../../shared/auto-approval-review'
import { consultAuto } from './auto-review'

describe('auto review reply', () => {
  it('accepts only the exact words', () => {
    expect(parseAutoApprovalReview('allow')).toBe('allow')
    expect(parseAutoApprovalReview(' Allow ')).toBe('allow')
    expect(parseAutoApprovalReview('refuse')).toBe('refuse')
    expect(parseAutoApprovalReview('allow.')).toBe('refuse')
    expect(parseAutoApprovalReview('yes')).toBe('refuse')
  })
})

describe('auto review consultation', () => {
  it('does not call the model for a cage decision', async () => {
    const review = vi.fn(async () => 'allow' as const)
    const allowed = await consultAuto({
      decision: { outcome: 'allow', reason: 'read-only' },
      signal: new AbortController().signal,
      cacheGet: () => undefined,
      cacheSet: () => {},
      review,
    })
    const refused = await consultAuto({
      decision: { outcome: 'refuse', reason: 'outside' },
      signal: new AbortController().signal,
      cacheGet: () => undefined,
      cacheSet: () => {},
      review,
    })
    expect(allowed).toEqual({ proceed: true, reason: 'read-only' })
    expect(refused).toEqual({ proceed: false, reason: 'outside' })
    expect(review).not.toHaveBeenCalled()
  })

  it('reuses one verdict for the same card', async () => {
    const review = vi.fn(async () => 'allow' as const)
    const cache = new Map<string, 'allow' | 'refuse'>()
    const input = {
      decision: { outcome: 'review' as const, reason: 'write', card: { lane: 'terminal' as const, cwd: '.', command: 'rm ./file' } },
      signal: new AbortController().signal,
      cacheGet: (card: string) => cache.get(card),
      cacheSet: (card: string, verdict: 'allow' | 'refuse') => { cache.set(card, verdict) },
      review,
    }
    expect((await consultAuto(input)).proceed).toBe(true)
    expect((await consultAuto(input)).reason).toBe('A previous review allowed this action.')
    expect(review).toHaveBeenCalledOnce()
  })

  it('treats a review timeout as a refusal', async () => {
    const review = vi.fn((_card: unknown, signal: AbortSignal) => new Promise<'allow' | 'refuse'>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const verdict = await consultAuto({
      decision: { outcome: 'review', reason: 'write', card: { lane: 'computer_use', actionKind: 'click', appName: 'Notes', windowTitle: 'Notes', detail: '1,2' } },
      signal: new AbortController().signal,
      timeoutMs: 20,
      cacheGet: () => undefined,
      cacheSet: () => {},
      review,
    })
    expect(verdict).toEqual({ proceed: false, reason: 'Auto review refused this action.' })
  })
})
