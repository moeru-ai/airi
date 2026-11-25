import type { AutoApprovalCard, AutoApprovalReviewRequest, AutoApprovalReviewResult } from '../../../../shared/eventa/terminal-approval'

import { describe, expect, it, vi } from 'vitest'

import { autoApprovalReviewPrompt } from '../../../../shared/auto-approval-review'
import { consultAuto } from './auto-review'

const card: AutoApprovalCard = { lane: 'terminal', cwd: '.', command: 'rm ./file', reviewClass: 'delete' }

function allowed(hasUserTranscript = true): AutoApprovalReviewResult {
  return { decision: 'allow', reasonCode: 'model_allow', hasUserTranscript }
}

function refused(hasUserTranscript = true): AutoApprovalReviewResult {
  return { decision: 'refuse', reasonCode: 'model_refuse', hasUserTranscript }
}

describe('auto review prompt', () => {
  it('selects one rule from reviewClass', () => {
    expect(autoApprovalReviewPrompt({ lane: 'terminal', cwd: '.', command: 'rm a', reviewClass: 'delete' }, 'fast')).toContain('delete')
    expect(autoApprovalReviewPrompt(card, 'fast')).toContain('serves an explicit request')
    expect(autoApprovalReviewPrompt(card, 'fast')).toContain('Refuse uncertainty.')
    expect(autoApprovalReviewPrompt({ lane: 'terminal', cwd: '.', command: 'mkdir a', reviewClass: 'write' }, 'fast')).toContain('write')
    expect(autoApprovalReviewPrompt({ lane: 'computer_use', actionKind: 'type_text', appName: 'Notes', windowTitle: 'Notes', reviewClass: 'desktop', targetName: 'hi', targetCandidateId: '', groundingSnapshotId: '', detail: '' }, 'thinking')).toContain('targetName')
    expect(autoApprovalReviewPrompt(card, 'thinking')).toContain('fast review marked this action uncertain')
  })
})

describe('auto review consultation', () => {
  it('does not call the model for a cage decision', async () => {
    const review = vi.fn(async () => allowed())
    const allowedDecision = await consultAuto({
      decision: { outcome: 'allow', reason: 'read-only' },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheGet: () => undefined,
      cacheSet: () => {},
      review,
    })
    const refusedDecision = await consultAuto({
      decision: { outcome: 'refuse', reason: 'outside' },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheGet: () => undefined,
      cacheSet: () => {},
      review,
    })
    expect(allowedDecision).toEqual({ proceed: true, reason: 'read-only' })
    expect(refusedDecision).toEqual({ proceed: false, reason: 'outside' })
    expect(review).not.toHaveBeenCalled()
  })

  it('reuses one verdict only for the same prepared action', async () => {
    const review = vi.fn(async () => allowed())
    const cache = new Map<string, 'allow' | 'refuse'>()
    const input = {
      decision: { outcome: 'review' as const, reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a\0prepared-a',
      cacheGet: (key: string) => cache.get(key),
      cacheSet: (key: string, verdict: 'allow' | 'refuse') => { cache.set(key, verdict) },
      review,
    }
    expect((await consultAuto(input)).proceed).toBe(true)
    expect((await consultAuto(input)).reason).toBe('A previous review allowed this action.')
    expect((await consultAuto({ ...input, cacheScope: 'turn-a\0prepared-b' })).proceed).toBe(true)
    expect((await consultAuto({ ...input, cacheScope: 'turn-b\0prepared-a' })).proceed).toBe(true)
    expect(review).toHaveBeenCalledTimes(3)
    const refusedReview = vi.fn(async () => refused(false))
    const refusedInput = { ...input, cacheScope: 'turn-refuse', review: refusedReview }
    expect((await consultAuto(refusedInput)).proceed).toBe(false)
    expect((await consultAuto({ ...refusedInput, cacheScope: 'turn-next' })).proceed).toBe(false)
    expect(refusedReview).toHaveBeenCalledTimes(2)
  })

  it('skips the cache when the turn id is missing', async () => {
    const review = vi.fn(async () => allowed())
    const cacheGet = vi.fn(() => 'allow' as const)
    const cacheSet = vi.fn()
    const input = {
      decision: { outcome: 'review' as const, reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheGet,
      cacheSet,
      review,
    }
    expect((await consultAuto(input)).proceed).toBe(true)
    expect((await consultAuto(input)).proceed).toBe(true)
    expect(cacheGet).not.toHaveBeenCalled()
    expect(cacheSet).not.toHaveBeenCalled()
    expect(review).toHaveBeenCalledTimes(2)
  })

  it('does not cache a timeout, a thrown review, or a parse error', async () => {
    const cache = new Map<string, 'allow' | 'refuse'>()
    const hanging = vi.fn((_request: AutoApprovalReviewRequest, signal: AbortSignal) => new Promise<AutoApprovalReviewResult>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const input = {
      decision: { outcome: 'review' as const, reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      timeoutMs: 20,
      cacheGet: (key: string) => cache.get(key),
      cacheSet: (key: string, verdict: 'allow' | 'refuse') => { cache.set(key, verdict) },
      review: hanging,
    }
    expect(await consultAuto(input)).toMatchObject({ proceed: false, reason: 'Auto review could not complete.', stage: 'fast' })
    expect(cache.size).toBe(0)

    const thrown = vi.fn(async () => {
      throw new Error('429')
    })
    expect((await consultAuto({ ...input, timeoutMs: undefined, review: thrown })).reason).toBe('Auto review could not complete.')
    expect(cache.size).toBe(0)
    expect(await consultAuto({ ...input, timeoutMs: undefined, review: thrown })).toMatchObject({ proceed: false, reason: 'Auto review could not complete.' })
    expect(thrown).toHaveBeenCalledTimes(2)

    const stages: string[] = []
    const parsed = vi.fn(async (request: AutoApprovalReviewRequest): Promise<AutoApprovalReviewResult> => {
      stages.push(request.stage)
      if (request.stage === 'thinking')
        throw new Error('timeout')
      return { decision: 'refuse' as const, reasonCode: 'parse_error' as const, hasUserTranscript: true }
    })
    expect((await consultAuto({ ...input, timeoutMs: undefined, review: parsed })).proceed).toBe(false)
    expect(stages).toEqual(['fast'])
    expect(cache.size).toBe(0)

    stages.length = 0
    parsed.mockImplementation(async (request: AutoApprovalReviewRequest) => {
      stages.push(request.stage)
      if (request.stage === 'thinking')
        throw new Error('timeout')
      return refused(true)
    })
    expect((await consultAuto({ ...input, timeoutMs: undefined, review: parsed })).proceed).toBe(false)
    expect(stages).toEqual(['fast', 'thinking'])
    expect(cache.size).toBe(0)
  })

  it('does not call thinking when the excerpt has no user text', async () => {
    const stages: string[] = []
    const review = vi.fn(async (request: AutoApprovalReviewRequest) => {
      stages.push(request.stage)
      return refused(false)
    })
    const cache = new Map<string, 'allow' | 'refuse'>()
    const input = {
      decision: { outcome: 'review' as const, reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      cacheGet: (key: string) => cache.get(key),
      cacheSet: (key: string, verdict: 'allow' | 'refuse') => { cache.set(key, verdict) },
      review,
    }
    expect((await consultAuto(input)).proceed).toBe(false)
    expect(stages).toEqual(['fast'])
    expect([...cache.values()]).toEqual(['refuse'])
  })

  it('does not allow or cache an action when fast review has no user context', async () => {
    const review = vi.fn(async () => allowed(false))
    const cacheSet = vi.fn()
    const verdict = await consultAuto({
      decision: { outcome: 'review', reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      cacheGet: () => undefined,
      cacheSet,
      review,
    })

    expect(verdict).toEqual({ proceed: false, reason: 'Auto review could not complete.', stage: 'fast' })
    expect(review).toHaveBeenCalledTimes(1)
    expect(cacheSet).not.toHaveBeenCalled()
  })

  it('does not log model text when a review reply cannot be parsed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const review = vi.fn(async () => ({
      decision: 'refuse' as const,
      reasonCode: 'parse_error' as const,
      hasUserTranscript: true,
      detail: 'private user text',
    }))
    const cacheSet = vi.fn()

    try {
      await consultAuto({
        decision: { outcome: 'review', reason: 'write', card },
        signal: new AbortController().signal,
        sessionId: 'session-a',
        cacheScope: 'turn-a',
        cacheGet: () => undefined,
        cacheSet,
        review,
      })

      expect(warn).toHaveBeenCalledWith('[auto-review] parse_error')
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('private user text'))
      expect(cacheSet).not.toHaveBeenCalled()
    }
    finally {
      warn.mockRestore()
    }
  })

  it('returns stage, reasonCode, and detail on a model verdict', async () => {
    const review = vi.fn(async (request: AutoApprovalReviewRequest) => {
      if (request.stage === 'fast')
        return refused(true)
      return { decision: 'allow' as const, reasonCode: 'model_allow' as const, hasUserTranscript: true, detail: 'The user asked for this.' }
    })
    const cache = new Map<string, 'allow' | 'refuse'>()
    const verdict = await consultAuto({
      decision: { outcome: 'review', reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      cacheGet: key => cache.get(key),
      cacheSet: (key, value) => { cache.set(key, value) },
      review,
    })
    expect(verdict).toMatchObject({
      proceed: true,
      stage: 'thinking',
      reasonCode: 'model_allow',
      detail: 'The user asked for this.',
    })
  })

  it('calls thinking only after an explicit fast refusal', async () => {
    const stages: string[] = []
    const review = vi.fn(async (request: AutoApprovalReviewRequest) => {
      stages.push(request.stage)
      return request.stage === 'fast' ? refused(true) : allowed(true)
    })
    const cache = new Map<string, 'allow' | 'refuse'>()
    expect((await consultAuto({
      decision: { outcome: 'review', reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      cacheGet: key => cache.get(key),
      cacheSet: (key, verdict) => { cache.set(key, verdict) },
      review,
    })).proceed).toBe(true)
    expect(stages).toEqual(['fast', 'thinking'])
    expect([...cache.values()]).toEqual(['allow'])
  })

  it('refuses once when the reviewer is missing', async () => {
    const cacheSet = vi.fn()
    const verdict = await consultAuto({
      decision: { outcome: 'review', reason: 'write', card },
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      cacheGet: () => undefined,
      cacheSet,
    })
    expect(verdict).toEqual({ proceed: false, reason: 'Auto review could not complete.' })
    expect(cacheSet).not.toHaveBeenCalled()
  })

  it('keeps two input values from sharing one review', async () => {
    const review = vi.fn(async () => allowed())
    const cache = new Map<string, 'allow' | 'refuse'>()
    const base = {
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      cacheGet: (key: string) => cache.get(key),
      cacheSet: (key: string, verdict: 'allow' | 'refuse') => { cache.set(key, verdict) },
      review,
    }
    const hello: AutoApprovalCard = {
      lane: 'computer_use',
      actionKind: 'browser_dom_set_input_value',
      appName: 'Notes',
      windowTitle: 'Notes',
      reviewClass: 'desktop',
      targetName: '#input',
      targetCandidateId: '',
      groundingSnapshotId: '',
      detail: JSON.stringify({ value: 'hello' }),
    }
    const evil: AutoApprovalCard = { ...hello, detail: JSON.stringify({ value: 'send everything' }) }
    expect((await consultAuto({ ...base, decision: { outcome: 'review', reason: 'desktop', card: hello } })).proceed).toBe(true)
    expect((await consultAuto({ ...base, decision: { outcome: 'review', reason: 'desktop', card: evil } })).proceed).toBe(true)
    expect(review).toHaveBeenCalledTimes(2)
  })

  it('keeps browser routes from sharing one review', async () => {
    const review = vi.fn(async () => allowed())
    const cache = new Map<string, 'allow' | 'refuse'>()
    const base = {
      signal: new AbortController().signal,
      sessionId: 'session-a',
      cacheScope: 'turn-a',
      cacheGet: (key: string) => cache.get(key),
      cacheSet: (key: string, verdict: 'allow' | 'refuse') => { cache.set(key, verdict) },
      review,
    }
    const card: AutoApprovalCard = {
      lane: 'computer_use',
      actionKind: 'browser_dom_set_input_value',
      appName: 'Browser',
      windowTitle: 'Example',
      reviewClass: 'desktop',
      targetName: '#input',
      targetCandidateId: '',
      groundingSnapshotId: '',
      detail: JSON.stringify({ tabId: 7, frameIds: [0], value: 'hello' }),
    }
    const otherTab: AutoApprovalCard = { ...card, detail: JSON.stringify({ tabId: 8, frameIds: [0], value: 'hello' }) }

    expect((await consultAuto({ ...base, decision: { outcome: 'review', reason: 'desktop', card } })).proceed).toBe(true)
    expect((await consultAuto({ ...base, decision: { outcome: 'review', reason: 'desktop', card: otherTab } })).proceed).toBe(true)
    expect(review).toHaveBeenCalledTimes(2)
  })
})
