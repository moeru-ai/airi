import type { ModelAsset, ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'
import type { InferOutput } from 'valibot'

import { ModelAssetRepository } from '@proj-airi/stage-shared/model-assets'
import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'

import * as v from 'valibot'

import { updateModelAssetStatus } from '../../../../composables/use-model-asset-status'
import { OpfsModelAssetStorage } from '../../../inference/model-assets-opfs'
import { kwsModel } from '../../../voice/kws-model-info'
import { sherpawModelResources } from './model-resources'

/**
 * Every Sherpaw preload pack that the host exposes.
 * The wake word and speaker packs share the repository, so their download status, cancellation, and deletion follow the transcription models.
 */
const packs = [
  ...sherpawModelResources,
  ...[kwsModel, speakerModel].flatMap(model => assets[model.id] ? [{ model, files: assets[model.id]! }] : []),
]

const models: ModelAsset[] = packs.map(({ model, files }) => ({
  id: model.id,
  revision: model.revision,
  source: files.source,
  files: [
    { name: 'data', url: new URL(files.data, globalThis.document?.baseURI ?? import.meta.url).href },
    { name: 'metadata', url: new URL(files.metadata, globalThis.document?.baseURI ?? import.meta.url).href },
  ],
}))

/** One repository serves every Sherpaw Provider instance in this renderer. */
export const sherpawModelAssets = new ModelAssetRepository(models, new OpfsModelAssetStorage())
sherpawModelAssets.subscribe(updateModelAssetStatus)
for (const status of sherpawModelAssets.list())
  updateModelAssetStatus(status)

// NOTICE:
// Before the model asset repository, Sherpaw cached remote model files in Cache Storage.
// Nothing reads, measures, or clears that `sherpaw-models` entry now, so delete it once at startup.
// Source: `fetchCachedModel` in packages/stage-ui/src/libs/inference/cache-utils.ts before PR #2696.
// Remove when the release that includes PR #2696 is six months old.
if (typeof caches !== 'undefined') {
  void caches.delete('sherpaw-models')
    .catch(error => console.warn('Failed to delete the old Sherpaw model cache:', error))
}

export function isSherpawModelBundled(id: string): boolean {
  return models.find(model => model.id === id)?.source === 'bundled'
}

interface HostModelAssets {
  fetch: (model: ModelAsset, fileName: string, signal?: AbortSignal) => Promise<Response>
  list: () => Promise<ModelAssetStatus[]>
  ensure: (id: string) => Promise<void>
  cancel: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  restore: (id: string, revision: string, files: Readonly<Record<string, Uint8Array>>) => Promise<void>
  clear: () => Promise<void>
}

export interface SherpawModelAssetBundle {
  id: string
  revision: string
  files: Record<string, Uint8Array>
}

let host: HostModelAssets | undefined

/** Electron installs model pairs in the main process and serves them by protocol. */
export function setSherpawModelAssetHost(value: HostModelAssets): void {
  host = value
}

export async function listSherpawModelAssets() {
  if (host) {
    const statuses = await host.list()
    for (const status of statuses) {
      if (!isSherpawModelBundled(status.id))
        updateModelAssetStatus(status)
    }
    return statuses
  }
  await Promise.all(models.map(model => sherpawModelAssets.inspect(model.id)))
  return sherpawModelAssets.list()
}

export async function ensureSherpawModelAssets(id: string): Promise<void> {
  if (host && !isSherpawModelBundled(id))
    return host.ensure(id)
  return sherpawModelAssets.ensureAvailable(id)
}

export async function cancelSherpawModelAssets(id: string): Promise<void> {
  if (host && !isSherpawModelBundled(id))
    return host.cancel(id)
  return sherpawModelAssets.cancel(id)
}

export async function removeSherpawModelAssets(id: string): Promise<void> {
  if (host && !isSherpawModelBundled(id))
    return host.remove(id)
  return sherpawModelAssets.remove(id)
}

/** Reads every installed file for one downloaded model. */
export async function exportSherpawModelAssets(id: string): Promise<SherpawModelAssetBundle> {
  const model = models.find(candidate => candidate.id === id)
  if (!model || model.source === 'bundled')
    throw new Error(`Downloaded model assets are unavailable: ${id}`)

  const status = (await listSherpawModelAssets()).find(candidate => candidate.id === id)
  if (status?.state !== 'installed')
    throw new Error(`The model is not installed: ${id}`)

  const entries = await Promise.all(model.files.map(async (file) => {
    const response = await fetchSherpawModel(file.url)
    if (!response.ok)
      throw new Error(`Could not read model asset ${id}/${file.name}`)
    return [file.name, new Uint8Array(await response.arrayBuffer())] as const
  }))
  return { id, revision: model.revision, files: Object.fromEntries(entries) }
}

function isSherpawMetadataFilename(filename: string): boolean {
  const filenameWithoutRootSlash = filename.startsWith('/') ? filename.slice(1) : filename
  return filenameWithoutRootSlash !== '.'
    && filenameWithoutRootSlash !== '..'
    && /^[\w.-]+$/.test(filenameWithoutRootSlash)
}

const metadataSchema = v.strictObject({
  files: v.array(v.pipe(
    v.strictObject({
      filename: v.pipe(v.string(), v.check(isSherpawMetadataFilename)),
      start: v.pipe(v.number(), v.finite()),
      end: v.pipe(v.number(), v.finite()),
    }),
  )),
  remote_package_size: v.pipe(v.number(), v.finite()),
})

function metadataSchemaForData(dataByteLength: number) {
  return v.pipe(metadataSchema, v.check(metadata => metadata.remote_package_size === dataByteLength
    && metadata.files.every(file => file.start >= 0 && file.end > file.start && file.end <= dataByteLength)))
}

/** Validates a complete downloaded model bundle against the local catalogue. */
export function validateSherpawModelAssetBundle(id: string, revision: string, files: Readonly<Record<string, Uint8Array>>): SherpawModelAssetBundle {
  const model = models.find(candidate => candidate.id === id)
  if (!model || model.source === 'bundled' || model.revision !== revision)
    throw new Error('The voice model file uses an unsupported model version')

  const bundle = v.parse(v.strictObject({
    id: v.literal(model.id),
    revision: v.literal(model.revision),
    files: v.strictObject(Object.fromEntries(model.files.map(file => [
      file.name,
      v.pipe(v.instance(Uint8Array), v.check(content => content.byteLength > 0)),
    ]))),
  }), { id, revision, files })
  v.parse(metadataSchemaForData(bundle.files.data.byteLength), JSON.parse(new TextDecoder().decode(bundle.files.metadata)))

  return bundle
}

/** Applies an adapter-validated model bundle through the platform-owned asset repository. */
export async function restoreSherpawModelAssets(bundle: SherpawModelAssetBundle): Promise<void> {
  if (host)
    return host.restore(bundle.id, bundle.revision, bundle.files)
  return sherpawModelAssets.restore(bundle.id, bundle.revision, bundle.files)
}

/** Removes every downloaded Sherpaw model. Bundled models stay in the application package. */
export async function clearSherpawModelAssets(): Promise<void> {
  if (host)
    return host.clear()
  return sherpawModelAssets.clear()
}

/** Resolves pinned Sherpaw URLs through the installed model pair. */
export async function fetchSherpawModel(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requested = new URL(input instanceof Request ? input.url : String(input), globalThis.document?.baseURI ?? import.meta.url).href
  const model = models.find(candidate => candidate.files.some(file => file.url === requested))
  if (!model || model.source === 'bundled')
    return fetch(input, init)
  const file = model.files.find(candidate => candidate.url === requested)!
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  if (host)
    return host.fetch(model, file.name, signal)
  return sherpawModelAssets.open(model.id, file.name, signal)
}

/** A complete Sherpaw preload pack: the data file and the file table of its metadata. */
export interface SherpawModelPack {
  data: ArrayBuffer
  metadata: InferOutput<typeof metadataSchema>
}

/**
 * Reads a pinned preload pack from the location that the host's Sherpaw Vite plugin exposes.
 *
 * Remote packs install through the host model asset repository, which reports progress and supports cancel and delete.
 * Bundled packs are application files, so the repository fetches them directly.
 *
 * @param id The pack ID that the host's Sherpaw Vite plugin exposes.
 * @param name The model name in error messages, for example `wake word model`.
 * @param signal Aborting it stops the read. A download that no other caller waits for stops too.
 */
export async function fetchSherpawModelPack(id: string, name: string, signal?: AbortSignal): Promise<SherpawModelPack> {
  const files = assets[id]
  if (!files)
    throw new Error(`This application does not include the ${name}`)

  const [dataResponse, metadataResponse] = await Promise.all([
    fetchSherpawModel(new URL(files.data, document.baseURI), { signal }),
    fetchSherpawModel(new URL(files.metadata, document.baseURI), { signal }),
  ])
  if (!dataResponse.ok || !metadataResponse.ok)
    throw new Error(`Could not download the ${name} (${dataResponse.status}, ${metadataResponse.status})`)

  const [data, metadataValue] = await Promise.all([dataResponse.arrayBuffer(), metadataResponse.json()])
  const metadata = v.parse(metadataSchemaForData(data.byteLength), metadataValue)

  return { data, metadata }
}
