export { getMaterialType, loadMmd, type MmdLoadResult } from './core'
export { registerMmdTextures, unregisterMmdTextures, useMMDLoader, useVMDLoader } from './loader'

// 增强版加载器（包含缓存、占位模型、资源清理）
export {
  clearMmdCache,
  disposeMmdResult,
  getCachedMmd,
  getMmdCacheSize,
  isMmdCached,
  loadMmd as loadMmdEnhanced,
  loadMmdTexture,
  type MMDModelData,
} from './loader-enhanced'
