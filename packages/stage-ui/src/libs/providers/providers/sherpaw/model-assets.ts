import type { ModelAsset, ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import { ModelAssetRepository } from '@proj-airi/stage-shared/model-assets'

import { updateModelAssetStatus } from '../../../../composables/use-model-asset-status'
import { OpfsModelAssetStorage } from '../../../inference/model-assets-opfs'
import { sherpawModelResources } from './model-resources'

const models: ModelAsset[] = sherpawModelResources.map(({ model, files }) => ({
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

export function isSherpawModelBundled(id: string): boolean {
  return models.find(model => model.id === id)?.source === 'bundled'
}

interface HostModelAssets {
  fetch: (model: ModelAsset, fileName: string, signal?: AbortSignal) => Promise<Response>
  list: () => Promise<ModelAssetStatus[]>
  ensure: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
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

export async function removeSherpawModelAssets(id: string): Promise<void> {
  if (host && !isSherpawModelBundled(id))
    return host.remove(id)
  return sherpawModelAssets.remove(id)
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
