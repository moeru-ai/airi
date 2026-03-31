import {
  MToonMaterialLoaderPlugin,
  MToonMaterialOutlineWidthMode,
  VRMLoaderPlugin,
} from '@pixiv/three-vrm'
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

let loader: GLTFLoader

// Lilia: This is an experimental option to enable fallback outline for all materials regardless of the original outline settings.
const AIRI_ALL_OUTLINE = false

interface OutlineFallbackSettings {
  mode: MToonMaterialOutlineWidthMode
  widthFactor: number
}

class AiriMToonMaterialLoaderPlugin extends MToonMaterialLoaderPlugin {
  private _outlineFallbackSettings?: OutlineFallbackSettings

  override async beforeRoot() {
    await super.beforeRoot()

    if (!AIRI_ALL_OUTLINE)
      return

    this._outlineFallbackSettings = this._resolveOutlineFallbackSettings()
  }

  override extendMaterialParams(materialIndex: number, materialParams: Record<string, any>) {
    const pending = super.extendMaterialParams(materialIndex, materialParams)

    if (!AIRI_ALL_OUTLINE)
      return pending

    const extension = this._getMToonExtension(materialIndex)
    if (!extension)
      return pending

    if (this._hasEnabledOutline(extension))
      return pending

    if (!this._outlineFallbackSettings)
      return pending

    // NOTICE: We patch fallback outline params before three-vrm starts mesh setup so the upstream
    // `MToonMaterialLoaderPlugin` can keep using its own `_generateOutline()` path. This keeps the
    // same mesh + material array + geometry groups structure as the stock loader.
    materialParams.outlineWidthMode = this._outlineFallbackSettings.mode
    materialParams.outlineWidthFactor = this._outlineFallbackSettings.widthFactor

    return pending
  }

  private _hasEnabledOutline(extension: NonNullable<ReturnType<MToonMaterialLoaderPlugin['_getMToonExtension']>>) {
    return typeof extension.outlineWidthMode === 'string'
      && extension.outlineWidthMode !== MToonMaterialOutlineWidthMode.None
      && typeof extension.outlineWidthFactor === 'number'
      && extension.outlineWidthFactor > 0
  }

  private _resolveOutlineFallbackSettings() {
    const materials = (this.parser.json as { materials?: unknown[] }).materials
    if (!materials?.length)
      return undefined

    const groupedWidthFactors = new Map<MToonMaterialOutlineWidthMode, number[]>()

    for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
      const extension = this._getMToonExtension(materialIndex)
      if (!extension || !this._hasEnabledOutline(extension))
        continue

      const mode = extension.outlineWidthMode as MToonMaterialOutlineWidthMode
      const widthFactors = groupedWidthFactors.get(mode) ?? []
      widthFactors.push(extension.outlineWidthFactor!)
      groupedWidthFactors.set(mode, widthFactors)
    }

    if (groupedWidthFactors.size === 0)
      return undefined

    let dominantMode: MToonMaterialOutlineWidthMode | undefined
    let dominantModeWidthFactors: number[] = []

    for (const [mode, widthFactors] of groupedWidthFactors) {
      if (widthFactors.length <= dominantModeWidthFactors.length)
        continue

      dominantMode = mode
      dominantModeWidthFactors = widthFactors
    }

    if (!dominantMode || dominantModeWidthFactors.length === 0)
      return undefined

    const widthFactorAverage = dominantModeWidthFactors.reduce((sum, value) => sum + value, 0) / dominantModeWidthFactors.length

    return {
      mode: dominantMode,
      widthFactor: widthFactorAverage,
    } satisfies OutlineFallbackSettings
  }
}

export function useVRMLoader() {
  if (loader) {
    return loader
  }

  loader = new GLTFLoader()

  loader.crossOrigin = 'anonymous'
  loader.register((parser) => {
    // NOTICE: Keep the ALL_OUTLINE policy inside the loader stage so three-vrm itself can decide
    // whether to generate the built-in outline layer. This avoids rebuilding the same-mesh
    // dual-material/groups structure later in AIRI runtime hooks.
    const mtoonMaterialPlugin = new AiriMToonMaterialLoaderPlugin(parser)
    return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin })
  })
  // loader.register(parser => new VRMCoreLoaderPlugin(parser))
  loader.register(parser => new VRMAnimationLoaderPlugin(parser))

  return loader
}
