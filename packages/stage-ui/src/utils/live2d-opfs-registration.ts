import { Live2DFactory, ZipLoader } from 'pixi-live2d-display/cubism4'

import { OPFSCache } from './opfs-loader'

const zipLoaderIndex = Live2DFactory.live2DModelMiddlewares.indexOf(ZipLoader.factory)

if (Live2DFactory.live2DModelMiddlewares.includes(OPFSCache.checkMiddleware)) {
  // Middlewares already registered.
}
else if (zipLoaderIndex !== -1) {
  // Insert Check before ZipLoader
  Live2DFactory.live2DModelMiddlewares.splice(zipLoaderIndex, 0, OPFSCache.checkMiddleware)
  // Insert Save after ZipLoader
  Live2DFactory.live2DModelMiddlewares.splice(zipLoaderIndex + 2, 0, OPFSCache.saveMiddleware)
}
else {
  console.warn('[OPFS] ZipLoader not found in middlewares, caching disabled')
}
