import type { ModelAsset } from '@proj-airi/stage-shared/model-assets'

import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { sherpawModelArtifactUrl, sherpawModels } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { ModelAssetRepository } from '@proj-airi/stage-shared/model-assets'
import { app, BrowserWindow, ipcMain, protocol } from 'electron'

import {
  electronModelAssetCancel,
  electronModelAssetEnsure,
  electronModelAssetRemove,
  electronModelAssetsClear,
  electronModelAssetsList,
  electronModelAssetStatusChanged,
} from '../../../shared/eventa/model-assets'
import { FileModelAssetStorage } from './model-asset-storage'

// The renderer gets mirror URLs from the Vite plugin, but main owns desktop downloads.
// The build defines the same endpoint for main, so both processes resolve one source.
const models: ModelAsset[] = Object.values(sherpawModels).map(model => ({
  id: model.id,
  revision: model.revision,
  source: 'remote',
  files: [
    { name: 'data', url: sherpawModelArtifactUrl(model, 'preload.data', import.meta.env.SHERPAW_MODEL_ENDPOINT) },
    { name: 'metadata', url: sherpawModelArtifactUrl(model, 'preload.js.metadata', import.meta.env.SHERPAW_MODEL_ENDPOINT) },
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
 * Sherpaw settings `cancelSherpawModelAssets`
 *   -> `electronModelAssetCancel`
 *     -> `ModelAssetRepository.cancel`
 */
export function setupSherpawModelAssets(context: ReturnType<typeof createContext>['context']): void {
  const storage = new FileModelAssetStorage(join(app.getPath('userData'), 'model-assets'))
  const repository = new ModelAssetRepository(models, storage)
  // NOTICE:
  // An unbound Eventa main context sends only to the sender of an incoming call.
  // Download progress has no call sender, so each open window needs a bound context.
  // Source: @moeru/eventa/adapters/electron/main createContext.
  // Remove when Eventa supports broadcasts from an unbound main context.
  const statusContexts = new WeakMap<BrowserWindow, ReturnType<typeof createContext>>()
  repository.subscribe((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      let target = statusContexts.get(window)
      if (!target) {
        target = createContext(ipcMain, window, { onlySameWindow: true })
        statusContexts.set(window, target)
      }
      void target.context.emit(electronModelAssetStatusChanged, status).catch(error => console.warn('Failed to publish model asset status:', error))
    }
  })

  defineInvokeHandler(context, electronModelAssetsList, async () => {
    await Promise.all(models.map(model => repository.inspect(model.id)))
    return repository.list()
  })
  defineInvokeHandler(context, electronModelAssetEnsure, id => repository.ensureAvailable(id))
  defineInvokeHandler(context, electronModelAssetCancel, id => repository.cancel(id))
  defineInvokeHandler(context, electronModelAssetRemove, id => repository.remove(id))
  defineInvokeHandler(context, electronModelAssetsClear, () => repository.clear())

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
