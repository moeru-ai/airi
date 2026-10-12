import type { KeywordEntry, KeywordSpotter, KWSModelPack } from '@sherpaw/kws'

import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'
import { array, number, object, parse, string } from 'valibot'

import modelTokens from './kws-vocabulary.json'

import { fetchSherpawModel } from '../providers/providers/sherpaw/model-assets'
import { kwsModel } from './kws-model-info'

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

const metadataSchema = object({
  files: array(object({ filename: string(), start: number(), end: number() })),
  remote_package_size: number(),
})

/** One renderer shares one model load. A failed load is removed, so a later preparation can retry. */
let loading: Promise<KWSModelPack> | undefined

async function fetchModel(): Promise<KWSModelPack> {
  const files = assets[kwsModel.id]
  if (!files)
    throw new Error('This application does not include the wake word model')

  // Remote packs install through the host model asset repository, which reports progress and supports cancel and delete.
  // Bundled packs are application files, so the repository fetches them directly.
  const [dataResponse, metadataResponse] = await Promise.all([
    fetchSherpawModel(new URL(files.data, document.baseURI)),
    fetchSherpawModel(new URL(files.metadata, document.baseURI)),
  ])
  if (!dataResponse.ok || !metadataResponse.ok)
    throw new Error(`Could not download the wake word model (${dataResponse.status}, ${metadataResponse.status})`)

  const [data, metadataValue] = await Promise.all([dataResponse.arrayBuffer(), metadataResponse.json()])
  const metadata = parse(metadataSchema, metadataValue)
  // A partial download must not reach the detector Worker.
  if (metadata.remote_package_size !== data.byteLength)
    throw new Error('The wake word model download is incomplete')

  return { data, metadata }
}

/** Loads the pinned keyword spotting pack from the location that the host's Sherpaw Vite plugin exposes. */
export async function loadKwsModel(): Promise<KWSModelPack> {
  loading ??= fetchModel()
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

  return createKeywordSpotter({ model, keywords }, { worker: new KwsWorker() })
}
