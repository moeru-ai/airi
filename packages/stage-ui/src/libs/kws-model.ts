import type { KWSModelPack } from '@sherpaw/kws'

import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'
import { array, number, object, parse, string } from 'valibot'

import { KWS_MODEL, KWS_MODEL_ID } from './kws-model-info'

export { KWS_MODEL_ID } from './kws-model-info'
const MODEL_CACHE_NAME = `airi-kws-${KWS_MODEL_ID}-${KWS_MODEL.revision}`

const metadataSchema = object({
  files: array(object({ filename: string(), start: number(), end: number() })),
  remote_package_size: number(),
})

const modelLoads = new Map<'bundled' | 'remote', Promise<KWSModelPack>>()

async function fetchArtifact(source: 'bundled' | 'remote', url: string): Promise<Response> {
  if (source === 'remote' && typeof caches !== 'undefined') {
    const cache = await caches.open(MODEL_CACHE_NAME)
    const cached = await cache.match(url)
    if (cached)
      return cached

    const response = await fetch(url)
    if (response.ok)
      await cache.put(url, response.clone())
    return response
  }

  return fetch(url)
}

async function fetchModel(source: 'bundled' | 'remote', dataUrl: string, metadataUrl: string): Promise<KWSModelPack> {
  const [dataResponse, metadataResponse] = await Promise.all([
    fetchArtifact(source, dataUrl),
    fetchArtifact(source, metadataUrl),
  ])
  if (!dataResponse.ok || !metadataResponse.ok)
    throw new Error(`Could not prepare the Wake Word model (${dataResponse.status}, ${metadataResponse.status}).`)

  const [data, metadataValue] = await Promise.all([dataResponse.arrayBuffer(), metadataResponse.json()])
  const metadata = parse(metadataSchema, metadataValue)
  if (metadata.remote_package_size !== data.byteLength)
    throw new Error('The Wake Word model is incomplete.')
  return { data, metadata }
}

/** Shares one model load per renderer and retries after a failed download. */
export async function loadKwsModel(): Promise<KWSModelPack> {
  const modelAssets = assets[KWS_MODEL_ID]
  if (!modelAssets)
    throw new Error('The Wake Word model is not available in this application.')
  const source = modelAssets.source
  let loading = modelLoads.get(source)
  if (!loading) {
    loading = fetchModel(source, modelAssets.data, modelAssets.metadata)
    modelLoads.set(source, loading)
  }
  try {
    return await loading
  }
  catch (error) {
    modelLoads.delete(source)
    throw error
  }
}

/** Reads the token vocabulary from the pinned Sherpaw preload pack. */
export function getKwsVocabulary(pack: KWSModelPack): Set<string> {
  const file = pack.metadata.files.find(entry => entry.filename === '/tokens.txt')
  if (!file)
    throw new Error('The Wake Word model has no token vocabulary.')
  const data = pack.data instanceof Uint8Array ? pack.data : new Uint8Array(pack.data)
  const text = new TextDecoder().decode(data.subarray(file.start, file.end))
  return new Set(text.trim().split(/\r?\n/).map(line => line.replace(/\s+\d+$/, '')))
}
