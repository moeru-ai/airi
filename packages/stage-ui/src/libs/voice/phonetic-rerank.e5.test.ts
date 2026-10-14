import type { PhoneticCandidate } from './phonetic-match'
import type { SemanticEmbedder } from './phonetic-rerank'

import { describe, expect, it } from 'vitest'

import { createSemanticReranker } from './phonetic-rerank'

/**
 * Runs multilingual E5 from Hugging Face in Node, the model that the app runs in a Worker.
 * It downloads about 120 MB, so it runs only with `AIRI_TEST_E5_RERANK=1`.
 */
async function createE5Embedder(): Promise<SemanticEmbedder> {
  const { pipeline } = await import('@huggingface/transformers')
  const extract = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' })
  const embed = async (text: string) => Array.from((await extract(text, { pooling: 'mean', normalize: true })).data as Float32Array)
  return { embedQuery: text => embed(`query: ${text}`), embedPassage: text => embed(`passage: ${text}`) }
}

function candidatesFor(text: string, span: string, terms: readonly (readonly [string, string, number])[]): PhoneticCandidate[] {
  const start = text.indexOf(span)
  return terms.map(([candidate, description, score]) => ({ span, candidate, term: candidate, description, score, source: 'test', start, end: start + span.length }))
}

const english = [
  ['reconciliation', 'Matching ledger entries against a bank statement.', 0.72],
  ['recognition', 'Identifying something seen or heard before.', 0.7],
  ['resignation', 'Leaving a job formally.', 0.7],
] as const

const mandarin = [
  ['硫方怪', 'A cube-shaped Minecraft mob that lives near sulfur springs.', 0.82],
  ['刘方贵', '一位历史学教授的名字', 0.8],
  ['流量卡', '手机运营商的上网套餐', 0.8],
] as const

describe.runIf(process.env.AIRI_TEST_E5_RERANK)('createSemanticReranker with multilingual E5', () => {
  it.each([
    { history: 'We closed the books this month. The bank statement and the ledger differ by 40 dollars.', text: 'I am doing the resilation now.', span: 'resilation', terms: english, expected: 'reconciliation' },
    { history: 'The microphone hears me fine but the transcript is wrong.', text: 'Speech resilation keeps failing on names.', span: 'resilation', terms: english, expected: 'recognition' },
    { history: 'I hate my boss and the overtime.', text: 'I handed in my resilation letter today.', span: 'resilation', terms: english, expected: 'resignation' },
    { history: '我们在玩我的世界。', text: '刚才在温泉边遇到了一只流氓怪', span: '流氓怪', terms: mandarin, expected: '硫方怪' },
    { history: '历史课上老师讲宋朝。', text: '他提到了流氓怪写的那本书', span: '流氓怪', terms: mandarin, expected: '刘方贵' },
    { history: '这个月话费太贵了。', text: '我想换一张流氓怪', span: '流氓怪', terms: mandarin, expected: '流量卡' },
  ])('chooses $expected for "$text"', async ({ history, text, span, terms, expected }) => {
    const rerank = createSemanticReranker({ embedder: await createE5Embedder(), history: () => [history], budgetMs: 60_000 })

    const [first] = await rerank({ text, candidates: candidatesFor(text, span, terms), sessionId: 'alice' }, new AbortController().signal)

    expect(first.candidate).toBe(expected)
  }, 120_000)
})
