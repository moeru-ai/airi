import { MMDLoader as MMDLoaderClass, VMDLoader as VMDLoaderClass } from '@moeru/three-mmd'
// 重新导出 stage-ui-live2d 的纹理注册函数，确保使用统一的registry
import { createMmdLoadingManager } from '@proj-airi/stage-ui-live2d/utils/mmd-zip-loader'

export { registerMmdTextures, unregisterMmdTextures } from '@proj-airi/stage-ui-live2d/utils/mmd-zip-loader'

// 使用 stage-ui-live2d 提供的统一 LoadingManager
// 它会正确解析纹理路径
let mmdLoader: MMDLoaderClass
let vmdLoader: VMDLoaderClass
let mmdLoadingManager: ReturnType<typeof createMmdLoadingManager>

/**
 * Singleton MMDLoader for loading PMD/PMX models
 * Uses a custom LoadingManager to resolve texture paths from extracted ZIP data
 */
export function useMMDLoader() {
  if (mmdLoader) {
    return mmdLoader
  }

  // Create a custom loading manager that can resolve texture paths
  mmdLoadingManager = createMmdLoadingManager()
  mmdLoader = new MMDLoaderClass([], mmdLoadingManager)
  return mmdLoader
}

/**
 * Singleton VMDLoader for loading VMD animations
 */
export function useVMDLoader() {
  if (vmdLoader) {
    return vmdLoader
  }

  vmdLoader = new VMDLoaderClass()
  return vmdLoader
}
