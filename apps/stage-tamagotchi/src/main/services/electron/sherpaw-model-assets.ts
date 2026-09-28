import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { ModelAsset } from '@proj-airi/stage-shared/model-assets'

import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { sherpawModelArtifactUrl, sherpawModels } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { ModelAssetRepository } from '@proj-airi/stage-shared/model-assets'
import { app, protocol } from 'electron'

import {
  electronModelAssetEnsure,
  electronModelAssetRemove,
  electronModelAssetsList,
  electronModelAssetStatusChanged,
} from '../../../shared/eventa/model-assets'
import { FileModelAssetStorage } from './model-asset-storage'

const models: ModelAsset[] = Object.values(sherpawModels).map(model => ({
  id: model.id,
  revision: model.revision,
  source: 'remote',
  files: [
    { name: 'data', url: sherpawModelArtifactUrl(model, 'preload.data') },
    { name: 'metadata', url: sherpawModelArtifactUrl(model, 'preload.js.metadata') },
  ],
}))

/**
 * Serves installed model pairs from the user data directory.
 *
 * Triggering workflow:
 *
 * Sherpaw renderer `fetchSherpawModel`
 *   -> `airi-model://assets/<id>/<revision>/<file>`
 *     -> `protocol.handle`
 *       -> `ModelAssetRepository.open`
 */
export function setupSherpawModelAssets(context: ReturnType<typeof createContext>['context']): void {
  const storage = new FileModelAssetStorage(join(app.getPath('userData'), 'model-assets'))
  const repository = new ModelAssetRepository(models, storage)
  repository.subscribe(status => context.emit(electronModelAssetStatusChanged, status))

  defineInvokeHandler(context, electronModelAssetsList, async () => {
    await Promise.all(models.map(model => repository.inspect(model.id)))
    return repository.list()
  })
  defineInvokeHandler(context, electronModelAssetEnsure, id => repository.ensureAvailable(id))
  defineInvokeHandler(context, electronModelAssetRemove, id => repository.remove(id))

  protocol.handle('airi-model', async (request) => {
    const url = new URL(request.url)
    const [id, revision, file, extra] = url.pathname.slice(1).split('/')
    const model = models.find(candidate => candidate.id === id)
    if (url.host !== 'assets' || extra !== undefined || !model || model.revision !== revision || !file
      || !model.files.some(candidate => candidate.name === file)) {
      return new Response('Not Found', { status: 404 })
    }
    const response = await repository.open(id, file, request.signal)
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, { status: response.status, headers })
  })
}
