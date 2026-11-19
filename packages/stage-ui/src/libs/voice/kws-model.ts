import type { KeywordEntry, KeywordSpotter, KWSModelPack } from '@sherpaw/kws'

import modelTokens from './kws-vocabulary.json'

import { fetchSherpawModelPack } from '../providers/providers/sherpaw/model-assets'
import { kwsModel } from './kws-model-info'
import { createToneVariants } from './kws-tones'

export { kwsModel } from './kws-model-info'

/**
 * Pronunciation tokens of the pinned pack, copied from its `/tokens.txt`.
 *
 * The keyword tool and card validation read this set without a model download.
 * Control tokens such as `<blk>` and `<unk>` are not pronunciations, so the set excludes them.
 */
export const kwsVocabulary: ReadonlySet<string> = new Set(modelTokens.filter(token => !/^<.+>$/.test(token)))

/** The model identity and vocabulary that `useWakeWordsStore().setWords` validates against. */
export const kwsVocabularyModel = { id: kwsModel.id, vocabulary: kwsVocabulary } as const

/** Tone variants of a card pronunciation. The detector adds them as extra matches of the same keyword. */
export const kwsToneVariants = createToneVariants(kwsVocabulary)

/**
 * Search settings of the pinned pack.
 *
 * - `maxActivePaths` keeps more hypotheses in the beam, so a keyword that starts in an unlikely path survives.
 * - `score` boosts keyword paths over other paths. `threshold` is the lowest keyword probability that triggers.
 *
 * The values come from the KWS presets of the Sherpaw sandbox, which detect "Hey Iru" in live microphone speech.
 * The sherpa-onnx defaults (4 paths, boost 1, threshold 0.25) missed most live calls of the same keyword in AIRI.
 * Source: https://github.com/moeru-ai/sherpaw/blob/main/packages/sandbox/src/features/kws/presets.ts
 */
export const kwsSearch = {
  maxActivePaths: 16,
  score: 1.5,
  threshold: 0.1,
} as const

/** One renderer shares one model load. A failed load is removed, so a later preparation can retry. */
let loading: Promise<KWSModelPack> | undefined

/** Loads the pinned keyword spotting pack from the location that the host's Sherpaw Vite plugin exposes. */
export async function loadKwsModel(): Promise<KWSModelPack> {
  loading ??= fetchSherpawModelPack(kwsModel.id, 'wake word model')
  const current = loading
  try {
    return await current
  }
  catch (error) {
    if (loading === current)
      loading = undefined
    throw error
  }
}

/**
 * Creates a keyword spotter Worker with the pinned pack. The caller owns the returned spotter and must dispose it.
 *
 * The Sherpaw client and its Worker load on first use, so hosts without wake words do not load the KWS runtime.
 */
export async function createKwsSpotter(keywords: readonly KeywordEntry[]): Promise<KeywordSpotter> {
  const [model, { createKeywordSpotter }, { default: KwsWorker }] = await Promise.all([
    loadKwsModel(),
    import('@sherpaw/kws'),
    import('@sherpaw/kws/worker?worker'),
  ])

  return createKeywordSpotter({ model, keywords, maxActivePaths: kwsSearch.maxActivePaths }, { worker: new KwsWorker() })
}
