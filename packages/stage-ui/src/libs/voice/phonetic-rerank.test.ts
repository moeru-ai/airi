import type { PhoneticCandidate } from './phonetic-match'
import type { SemanticEmbedder } from './phonetic-rerank'

import { describe, expect, it, vi } from 'vitest'

import { createSemanticReranker } from './phonetic-rerank'

/** Topic words of the fake embedder. Each text becomes a unit vector of its topic word counts. */
const topics = [['ledger', 'bank', 'statement'], ['speech', 'microphone', 'heard'], ['job', 'boss', 'leaving']]

function topicVector(text: string) {
  const words = text.toLowerCase().split(/\W+/)
  const vector = topics.map(group => words.filter(word => group.includes(word)).length + 0.1)
  const length = Math.hypot(...vector)
  return vector.map(value => value / length)
}

function createFakeEmbedder(): SemanticEmbedder & { queries: string[], passages: string[] } {
  const queries: string[] = []
  const passages: string[] = []
  return {
    queries,
    passages,
    embedQuery: async (text) => {
      queries.push(text)
      return topicVector(text)
    },
    embedPassage: async (text) => {
      passages.push(text)
      return topicVector(text)
    },
  }
}

const text = 'I am doing the resilation now'
const span = { span: 'resilation', start: 15, end: 25, source: 'test' }
const reconciliation: PhoneticCandidate = { ...span, candidate: 'reconciliation', term: 'reconciliation', score: 0.72, description: 'Matching ledger entries against a bank statement.' }
const recognition: PhoneticCandidate = { ...span, candidate: 'recognition', term: 'recognition', score: 0.7, description: 'Identifying speech heard by a microphone.' }
const resignation: PhoneticCandidate = { ...span, candidate: 'resignation', term: 'resignation', score: 0.68, description: 'Leaving a job and a boss.' }
const candidates = [reconciliation, recognition, resignation]

describe('createSemanticReranker', () => {
  it('puts the candidate that fits the conversation first when the sounds are a near tie', async () => {
    const rerank = createSemanticReranker({ embedder: createFakeEmbedder(), history: () => ['The microphone heard my speech wrong again.'] })

    const ranked = await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)

    expect(ranked.map(candidate => candidate.term)).toEqual(['recognition', 'reconciliation', 'resignation'])
  })

  it('keeps a clear phonetic winner against a weak topic signal', async () => {
    const rerank = createSemanticReranker({ embedder: createFakeEmbedder(), history: () => ['The microphone heard my speech wrong again.'], weight: 0.01 })

    const ranked = await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)

    expect(ranked.map(candidate => candidate.term)).toEqual(['reconciliation', 'recognition', 'resignation'])
  })

  it('masks the heard span in the query and labels each passage with its term and description', async () => {
    const embedder = createFakeEmbedder()
    const rerank = createSemanticReranker({ embedder, history: () => ['first message', 'second message'] })

    await rerank({ text, candidates: [{ ...reconciliation, candidate: '对账', term: 'reconciliation' }, recognition], sessionId: 'alice' }, new AbortController().signal)

    expect(embedder.queries).toEqual(['I am doing the ___ now\nsecond message\nfirst message'])
    expect(embedder.passages).toEqual(['对账 (reconciliation): Matching ledger entries against a bank statement.', 'recognition: Identifying speech heard by a microphone.'])
  })

  it('reads the history of the input session', async () => {
    const history = vi.fn((sessionId: string) => [`messages of ${sessionId}`])
    const embedder = createFakeEmbedder()
    const rerank = createSemanticReranker({ embedder, history })

    await rerank({ text, candidates, sessionId: 'bob' }, new AbortController().signal)

    expect(history).toHaveBeenCalledWith('bob')
    expect(embedder.queries).toEqual(['I am doing the ___ now\nmessages of bob'])
  })

  it('embeds one query for each group of overlapping spans', async () => {
    const embedder = createFakeEmbedder()
    const rerank = createSemanticReranker({ embedder, history: () => [] })
    const longer = { ...resignation, span: 'resilation now', end: 29 }
    const later: PhoneticCandidate = { ...recognition, span: 'I', start: 0, end: 1 }

    await rerank({ text, candidates: [reconciliation, longer, later], sessionId: 'alice' }, new AbortController().signal)

    expect(embedder.queries).toEqual(['___ am doing the resilation now', 'I am doing the ___'])
  })

  it('keeps only the end of a long history', async () => {
    const embedder = createFakeEmbedder()
    const rerank = createSemanticReranker({ embedder, history: () => ['old topic', 'new topic'], historyChars: 9 })

    await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)

    expect(embedder.queries).toEqual(['I am doing the ___ now\nnew topic'])
  })

  it('keeps the end of a newest message that is longer than the cap', async () => {
    const embedder = createFakeEmbedder()
    const rerank = createSemanticReranker({ embedder, history: () => ['older message', 'a long start, then the new topic'], historyChars: 13 })

    await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)

    expect(embedder.queries).toEqual(['I am doing the ___ now\nthe new topic'])
  })

  it('embeds each passage once across inputs', async () => {
    const embedder = createFakeEmbedder()
    const rerank = createSemanticReranker({ embedder, history: () => [] })

    await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)
    await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)

    expect(embedder.passages).toHaveLength(3)
    expect(embedder.queries).toEqual([text.replace('resilation', '___'), text.replace('resilation', '___')])
  })

  it('does no work for a single candidate', async () => {
    const embedder = createFakeEmbedder()
    const rerank = createSemanticReranker({ embedder, history: () => ['The microphone heard my speech wrong again.'] })

    const ranked = await rerank({ text, candidates: [reconciliation], sessionId: 'alice' }, new AbortController().signal)

    expect(ranked).toEqual([reconciliation])
    expect(embedder.queries).toEqual([])
  })

  it('keeps the phonetic order when the embeddings miss the budget', async () => {
    vi.useFakeTimers()
    const pending = new Promise<readonly number[]>(() => {})
    const embedQuery = vi.fn<SemanticEmbedder['embedQuery']>(() => pending)
    const rerank = createSemanticReranker({ embedder: { embedQuery, embedPassage: () => pending }, history: () => [], budgetMs: 400 })
    let settled: readonly PhoneticCandidate[] | undefined

    void rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal).then(ranked => settled = ranked)
    await vi.advanceTimersByTimeAsync(399)
    const beforeBudget = settled
    await vi.advanceTimersByTimeAsync(1)

    expect(embedQuery).toHaveBeenCalledTimes(1)
    expect(beforeBudget).toBeUndefined()
    expect(settled).toBe(candidates)
    vi.useRealTimers()
  })

  it('passes the input signal to the query embedding, so a superseded input can skip it', async () => {
    const embedder = createFakeEmbedder()
    const embedQuery = vi.spyOn(embedder, 'embedQuery')
    const rerank = createSemanticReranker({ embedder, history: () => [] })
    const controller = new AbortController()

    await rerank({ text, candidates, sessionId: 'alice' }, controller.signal)

    expect(embedQuery).toHaveBeenCalledWith('I am doing the ___ now', controller.signal)
  })

  it('keeps the phonetic order when the embedder fails, and embeds the passage again on the next input', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const embedPassage = vi.fn<SemanticEmbedder['embedPassage']>()
      .mockRejectedValueOnce(new Error('model download failed'))
      .mockImplementation(async passage => topicVector(passage))
    const rerank = createSemanticReranker({ embedder: { embedQuery: async query => topicVector(query), embedPassage }, history: () => ['microphone speech'] })

    const first = await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)
    const second = await rerank({ text, candidates, sessionId: 'alice' }, new AbortController().signal)

    expect(first).toBe(candidates)
    expect(warn).toHaveBeenCalledWith('[phonetic-rerank] Kept the phonetic order:', 'model download failed')
    expect(second[0].term).toBe('recognition')
    expect(embedPassage).toHaveBeenCalledTimes(4)
    warn.mockRestore()
  })

  it('stops waiting when the input is aborted', async () => {
    const pending = new Promise<readonly number[]>(() => {})
    const rerank = createSemanticReranker({ embedder: { embedQuery: () => pending, embedPassage: () => pending }, history: () => [], budgetMs: 60_000 })
    const controller = new AbortController()

    const ranked = rerank({ text, candidates, sessionId: 'alice' }, controller.signal)
    controller.abort()

    await expect(ranked).resolves.toBe(candidates)
  })
})
