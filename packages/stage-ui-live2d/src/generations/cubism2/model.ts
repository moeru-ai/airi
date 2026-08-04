import type { LoadedLive2DModel } from '../loader'

const cubism2ParameterIds: Record<string, string> = {
  ParamAngleX: 'PARAM_ANGLE_X',
  ParamAngleY: 'PARAM_ANGLE_Y',
  ParamAngleZ: 'PARAM_ANGLE_Z',
  ParamBodyAngleX: 'PARAM_BODY_ANGLE_X',
  ParamBodyAngleY: 'PARAM_BODY_ANGLE_Y',
  ParamBodyAngleZ: 'PARAM_BODY_ANGLE_Z',
  ParamBreath: 'PARAM_BREATH',
  ParamBrowLAngle: 'PARAM_BROW_L_ANGLE',
  ParamBrowLForm: 'PARAM_BROW_L_FORM',
  ParamBrowLX: 'PARAM_BROW_L_X',
  ParamBrowLY: 'PARAM_BROW_L_Y',
  ParamBrowRAngle: 'PARAM_BROW_R_ANGLE',
  ParamBrowRForm: 'PARAM_BROW_R_FORM',
  ParamBrowRX: 'PARAM_BROW_R_X',
  ParamBrowRY: 'PARAM_BROW_R_Y',
  ParamCheek: 'PARAM_CHEEK',
  ParamEyeBallX: 'PARAM_EYE_BALL_X',
  ParamEyeBallY: 'PARAM_EYE_BALL_Y',
  ParamEyeLOpen: 'PARAM_EYE_L_OPEN',
  ParamEyeLSmile: 'PARAM_EYE_L_SMILE',
  ParamEyeROpen: 'PARAM_EYE_R_OPEN',
  ParamEyeRSmile: 'PARAM_EYE_R_SMILE',
  ParamMouthForm: 'PARAM_MOUTH_FORM',
  ParamMouthOpenY: 'PARAM_MOUTH_OPEN_Y',
}

interface Cubism2CoreModel {
  getParamFloat: (idOrIndex: string | number) => number
  getParamIndex: (id: string) => number
  setParamFloat: (idOrIndex: string | number, value: number) => void
  update: () => void
}

interface Cubism2InternalModel extends AdaptableInternalModel {
  coreModel: Cubism2CoreModel
  updateWebGLContext: (gl: WebGLRenderingContext, contextId: number) => void
}

interface Cubism2RendererContext {
  CONTEXT_UID: number
  gl: WebGLRenderingContext
}

interface CompatibleCoreModel {
  getParameterDefaultValueById?: (id: string) => number
  getParameterValueById: (id: string) => number
  setParameterValueById: (id: string, value: number) => void
}

/**
 * The subset of `ModelSettings` the adapter reads to discover which parameters
 * a model actually animates. Both fields are optional because the adapter also
 * runs on preview/offscreen models whose settings never went through AIRI's
 * ZIP loader.
 */
interface AdaptableModelSettings {
  /**
   * Parsed `.exp.json` / `.exp3.json` payloads attached by AIRI's loaders
   * (see `utils/live2d-zip-loader.ts`). `data` stays `unknown` because it is
   * raw parsed JSON owned by the model author, not by the SDK.
   */
  _expFiles?: Array<{ data: unknown }>
  initParams?: Array<{ id: string }>
}

interface AdaptableInternalModel {
  coreModel: object
  updateWebGLContext?: (gl: WebGLRenderingContext, contextId: number) => void
  /**
   * `Live2DEyeBlink` on Cubism 2, `CubismEyeBlink` on Cubism 3+. Typed as
   * `unknown` here because the adapter only clears it, never calls it.
   */
  eyeBlink?: unknown
  /**
   * Kept as `object` rather than {@link AdaptableModelSettings}: the SDK's
   * `ModelSettings` shares none of those optional fields, so a structural
   * constraint would reject every real internal model. The adapter narrows and
   * validates the shape at the point of use instead.
   */
  settings?: object
}

function isCubism2CoreModel(coreModel: object): coreModel is Cubism2CoreModel {
  return 'getParamFloat' in coreModel && 'setParamFloat' in coreModel
}

/**
 * Initializes Cubism 2's WebGL-backed deformer output before PIXI can draw it.
 *
 * Cubism 3+ initializes drawable vertices while loading. The legacy core waits
 * for its first `update()`, and that update requires the renderer's GL context.
 */
export function initializeCubism2Model(
  internalModel: AdaptableInternalModel,
  renderer: object,
): void {
  if (!isCubism2CoreModel(internalModel.coreModel)
    || typeof internalModel.updateWebGLContext !== 'function'
    || !('CONTEXT_UID' in renderer)
    || typeof renderer.CONTEXT_UID !== 'number'
    || !('gl' in renderer)) {
    return
  }

  const cubism2Model = internalModel as Cubism2InternalModel
  const cubism2Renderer = renderer as Cubism2RendererContext
  cubism2Model.updateWebGLContext(cubism2Renderer.gl, cubism2Renderer.CONTEXT_UID)

  // NOTICE:
  // Cubism 2 does not calculate deformer output while loading the `.moc`.
  // The first draw can therefore expose raw, detached ArtMesh positions when
  // AIRI's application ticker renders before `Live2DModel`'s shared ticker.
  // Source/context: `Cubism2InternalModel.update()` calls `model.update()` in
  // `node_modules/pixi-live2d-display/dist/cubism2.es.js`; the core itself logs
  // `call update() before draw()` for this ordering violation.
  // Removal condition: the runtime initializes core deformer output before the
  // first draw, or AIRI updates every model on the renderer's own ticker.
  cubism2Model.coreModel.update()
}

/**
 * Reads the `params` array out of a parsed Cubism 2 `.exp.json` payload.
 *
 * The payload is author-controlled JSON, so every level is validated before
 * use; a malformed file yields no ids instead of throwing during model load.
 */
function readExpressionParamIds(data: unknown): string[] {
  if (typeof data !== 'object' || data === null)
    return []

  const params = (data as { params?: unknown }).params
  if (!Array.isArray(params))
    return []

  return params
    .map(param => (typeof param === 'object' && param !== null ? (param as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Collects the native (`PARAM_*`) ids whose rest-pose value must be snapshotted.
 *
 * The union covers model-declared ids that AIRI can safely prove exist: ids
 * referenced by expression files and ids explicitly initialized by settings.
 * Probing every AIRI alias is unsafe because Cubism 2 creates a synthetic
 * parameter whenever a requested id is absent.
 */
function collectSnapshotParameterIds(settings: object | undefined): Set<string> {
  const ids = new Set<string>()
  const { _expFiles, initParams } = (settings ?? {}) as AdaptableModelSettings

  // `_expFiles` is attached by AIRI's loaders, not declared by the SDK, so it
  // can legitimately be missing on models loaded through another path.
  if (Array.isArray(_expFiles)) {
    for (const expressionFile of _expFiles) {
      for (const id of readExpressionParamIds(expressionFile?.data))
        ids.add(id)
    }
  }

  if (Array.isArray(initParams)) {
    for (const initParam of initParams) {
      if (typeof initParam?.id === 'string')
        ids.add(initParam.id)
    }
  }

  return ids
}

/**
 * Adds AIRI's version-neutral parameter contract to a loaded internal model.
 *
 * Cubism 2 uses uppercase underscore-separated IDs and `getParamFloat`, while
 * Cubism 3+ exposes the camel-cased parameter API AIRI historically called.
 * The adapter preserves native IDs used by packaged expression files.
 *
 * Must be called synchronously right after `Live2DFactory.setupLive2DModel`
 * resolves and before the model is ticked: the default-value snapshot it takes
 * is only correct while the model still sits in its rest pose.
 */
export function adaptInternalModel<TInternalModel extends AdaptableInternalModel>(
  internalModel: TInternalModel,
): TInternalModel & { coreModel: CompatibleCoreModel } {
  const coreModel = internalModel.coreModel as object
  if (!isCubism2CoreModel(coreModel))
    return internalModel as TInternalModel & { coreModel: CompatibleCoreModel }

  const compatibleCore = coreModel as Cubism2CoreModel & Partial<CompatibleCoreModel>
  const defaults = new Map<string, number>()
  const declaredParameterIds = collectSnapshotParameterIds(internalModel.settings)
  const mouthFormId = declaredParameterIds.has('PARAM_MOUTH_FORM_01')
    ? 'PARAM_MOUTH_FORM_01'
    : 'PARAM_MOUTH_FORM'
  const nativeId = (id: string) => id === 'ParamMouthForm' ? mouthFormId : cubism2ParameterIds[id] ?? id

  for (const id of declaredParameterIds)
    defaults.set(id, compatibleCore.getParamFloat(id))

  // NOTICE:
  // Cubism 2 has no reachable per-parameter default. `Live2DModelWebGL`
  // (node_modules/pixi-live2d-display/types/index.d.ts:10-39) exposes no default
  // accessor and no parameter enumeration, and `Live2DObfuscated.ModelContext`
  // (same file, :95-103) only surfaces clipManager/_$aS/getDrawData.
  //
  // Observed failure: capturing on first read returned a mid-animation value,
  // because Model.vue awaits initExpressionController inside `finally` after the
  // model is already ticking, which made Add-blend expressions anchor to noise.
  //
  // The eager snapshot above is taken while the values still equal the pose that
  // Cubism2InternalModel.init() froze via coreModel.saveParam()
  // (dist/cubism2.es.js:1756-1764), so it IS the model default. This branch only
  // covers ids first requested after that point; its value is the first observed
  // value, not the model default.
  //
  // Removal condition: the Cubism 2 core exposes ParamDefSet defaults.
  const captureFirstObserved = (resolvedId: string, value: number) => {
    if (!defaults.has(resolvedId))
      defaults.set(resolvedId, value)
  }

  compatibleCore.getParameterValueById = (id: string) => {
    const resolvedId = nativeId(id)
    const value = compatibleCore.getParamFloat(resolvedId)
    captureFirstObserved(resolvedId, value)
    return value
  }
  compatibleCore.setParameterValueById = (id: string, value: number) => {
    compatibleCore.setParamFloat(nativeId(id), value)
  }
  compatibleCore.getParameterDefaultValueById = (id: string) => {
    const resolvedId = nativeId(id)
    captureFirstObserved(resolvedId, compatibleCore.getParamFloat(resolvedId))
    return defaults.get(resolvedId)!
  }

  // NOTICE:
  // Cubism 2's built-in eye blink is unusable, so AIRI's own timer blink owns
  // blinking on this generation. Nulling the field is the whole fix: the
  // `!ctx.internalModel.eyeBlink` guards in
  // `composables/live2d/motion-manager.ts:223` and `:354` already route the
  // model to `updateForcedBlink`, so no generation branch is needed there.
  //
  // Two independent defects, both in `dist/cubism2.es.js`:
  //
  // 1. Signature mismatch. `motion-manager.ts:224` and `:364` call
  //    `eyeBlink.updateParameters(model, seconds)`, but `Live2DEyeBlink`
  //    (dist/cubism2.es.js:1670-1718) only defines `update(dtMs)`. The
  //    resulting TypeError is thrown inside motionManager.update ->
  //    Cubism2InternalModel.update -> the PIXI render loop, where Canvas.vue's
  //    render guard catches it and stops the ticker, freezing the model.
  //
  // 2. It can never blink. The closing state calls
  //    `setEyeParams(this.eyeParamValue + dt / this.closingDuration)`
  //    (:1699) and then waits for `this.eyeParamValue <= 0` (:1700), while
  //    `setEyeParams` clamps to [0, 1] (:1685). Adding a positive delta to a
  //    value pinned at 1 never reaches 0, so the eyes stay open forever. The
  //    sign is wrong in dist/cubism2.es.js, dist/cubism2.min.js and upstream
  //    master alike.
  //
  // Removal condition: upstream fixes both the closing-state sign and the
  // `updateParameters(model, seconds)` signature.
  const blinkHost = internalModel as { eyeBlink?: unknown }
  blinkHost.eyeBlink = null

  return internalModel as TInternalModel & { coreModel: CompatibleCoreModel }
}

/** Initializes and adapts one Cubism 2 model immediately after SDK setup. */
export function prepareCubism2Model(model: LoadedLive2DModel, renderer: object): void {
  initializeCubism2Model(model, renderer)
  adaptInternalModel(model)
}
