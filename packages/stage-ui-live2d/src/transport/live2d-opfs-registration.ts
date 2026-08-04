import type { Live2DRuntime } from '../utils/live2d-runtime'

import { OPFSCache } from './opfs-loader'

let registeredRuntime: Live2DRuntime | undefined

export function registerLive2DOpfs(runtime: Live2DRuntime): void {
  if (registeredRuntime === runtime)
    return
  registeredRuntime = runtime

  const { Live2DFactory, ZipLoader } = runtime
  const zipLoaderIndex = Live2DFactory.live2DModelMiddlewares.indexOf(ZipLoader.factory)
  if (Live2DFactory.live2DModelMiddlewares.includes(OPFSCache.checkMiddleware))
    return

  if (zipLoaderIndex === -1) {
    console.warn('[OPFS] ZipLoader not found in middlewares, caching disabled')
    return
  }

  Live2DFactory.live2DModelMiddlewares.splice(zipLoaderIndex, 0, OPFSCache.checkMiddleware)
  Live2DFactory.live2DModelMiddlewares.splice(zipLoaderIndex + 2, 0, OPFSCache.saveMiddleware)
}
