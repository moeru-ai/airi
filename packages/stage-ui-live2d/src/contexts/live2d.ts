import type { Application } from '@pixi/app'
import type { Live2DModel as PixiLive2DModel } from 'pixi-live2d-display/cubism4'
import type { InjectionKey, MaybeRefOrGetter, ShallowRef } from 'vue'

import type { PixiLive2DInternalModel } from '../composables/live2d/motion-manager'
import type { Live2DControlPolicy } from '../types/avatar-model'
import type { Live2DExpressionsContext } from './expressions'
import type { Live2DMotionsContext } from './motions'

import { errorMessageFrom } from '@moeru/std'
import { inject, provide, shallowRef, toValue } from 'vue'

import { createLive2DControlPolicy, isLive2DControlEnabled } from '../controls/policy'
import { createLive2DExpressionsContext } from './expressions'
import { createLive2DMotionsContext } from './motions'

/** Lifecycle phase for one Live2D Root. */
export type Live2DPhase = 'idle' | 'loading' | 'ready' | 'error' | 'disposed'

/** Phase that produced a Live2D runtime error. */
export type Live2DErrorPhase = 'source' | 'renderer' | 'model' | 'expression' | 'motion' | 'render'

/** Error reported by one Live2D Root. */
export interface Live2DError {
  phase: Live2DErrorPhase
  cause: Error
}

/** Pixi renderer handles for one Live2D Root. */
export interface Live2DRendererContext {
  app: Readonly<ShallowRef<Application | undefined>>
  canvas: Readonly<ShallowRef<HTMLCanvasElement | undefined>>
  captureFrame: () => Promise<Blob | null>
  render: () => boolean
}

/** Loaded model handles for one Live2D Root. */
export interface Live2DModelContext {
  instance: Readonly<ShallowRef<PixiLive2DModel<PixiLive2DInternalModel> | undefined>>
  internalModel: Readonly<ShallowRef<PixiLive2DInternalModel | undefined>>
}

/** Public state and commands for one Live2D Root instance. */
export interface Live2DContext {
  source: Readonly<ShallowRef<string | undefined>>
  modelId: Readonly<ShallowRef<string>>
  /** Changes whenever the source must create a fresh model instance. */
  revision: Readonly<ShallowRef<number>>
  phase: Readonly<ShallowRef<Live2DPhase>>
  error: Readonly<ShallowRef<Live2DError | undefined>>
  renderer: Live2DRendererContext
  model: Live2DModelContext
  expressions: Live2DExpressionsContext
  motions: Live2DMotionsContext
  load: (source: string, modelId?: string) => void
  unload: () => void
  reload: () => void
  dispose: () => void
  setRenderer: (app: Application, canvas: HTMLCanvasElement) => void
  clearRenderer: (app: Application) => void
  beginModelLoad: (modelId: string) => void
  setModel: (
    instance: PixiLive2DModel<PixiLive2DInternalModel>,
    internalModel: PixiLive2DInternalModel,
  ) => void
  reportError: (phase: Live2DErrorPhase, error: unknown) => void
}

export interface CreateLive2DOptions {
  /** Character-owned control policy for the selected Avatar Model. */
  controlPolicy?: MaybeRefOrGetter<Live2DControlPolicy | undefined>
}

const live2DContextKey: InjectionKey<Live2DContext> = Symbol('live2d-context')

function errorFrom(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error(errorMessageFrom(value) ?? 'An unknown Live2D error occurred.')
}

/** Creates one isolated Live2D runtime for a Root component. */
export function createLive2D(options: CreateLive2DOptions = {}): Live2DContext {
  const source = shallowRef<string>()
  const modelId = shallowRef('')
  const revision = shallowRef(0)
  const phase = shallowRef<Live2DPhase>('idle')
  const error = shallowRef<Live2DError>()
  const app = shallowRef<Application>()
  const canvas = shallowRef<HTMLCanvasElement>()
  const modelInstance = shallowRef<PixiLive2DModel<PixiLive2DInternalModel>>()
  const internalModel = shallowRef<PixiLive2DInternalModel>()
  const defaultControlPolicy = createLive2DControlPolicy()
  let lastSource: { source: string, modelId?: string } | undefined

  function controlPolicy() {
    return toValue(options.controlPolicy) ?? defaultControlPolicy
  }

  const expressions = createLive2DExpressionsContext({
    getParameterDefault(parameterId) {
      const coreModel = internalModel.value?.coreModel
      if (!coreModel)
        return 0

      const coreModelWithDefaultLookup = coreModel as unknown as {
        getParameterDefaultValueById?: (id: string) => number
      }
      const defaultValue = coreModelWithDefaultLookup.getParameterDefaultValueById?.(parameterId)
      return typeof defaultValue === 'number'
        ? defaultValue
        : coreModel.getParameterValueById(parameterId)
    },
    isEnabled(expression) {
      return isLive2DControlEnabled(controlPolicy(), {
        kind: 'expression',
        id: expression.name,
      })
    },
  })
  const motions = createLive2DMotionsContext(motion => isLive2DControlEnabled(controlPolicy(), {
    kind: 'motion',
    id: motion.fileName,
  }))

  function load(nextSource: string, nextModelId?: string) {
    if (phase.value === 'disposed')
      throw new Error('The Live2D Root is disposed.')

    lastSource = { source: nextSource, modelId: nextModelId }
    source.value = nextSource
    modelId.value = nextModelId ?? nextSource
    revision.value += 1
    error.value = undefined
    phase.value = 'loading'
  }

  function clearLoadedModel() {
    expressions.clear()
    motions.clear()
    modelInstance.value = undefined
    internalModel.value = undefined
    modelId.value = ''
  }

  function unload() {
    const hadSource = source.value !== undefined
    clearLoadedModel()
    source.value = undefined
    if (hadSource)
      revision.value += 1
    error.value = undefined
    if (phase.value !== 'disposed')
      phase.value = 'idle'
  }

  function reload() {
    if (lastSource)
      load(lastSource.source, lastSource.modelId)
  }

  function setRenderer(nextApp: Application, nextCanvas: HTMLCanvasElement) {
    app.value = nextApp
    canvas.value = nextCanvas
  }

  function clearRenderer(owner: Application) {
    if (app.value !== owner)
      return

    app.value = undefined
    canvas.value = undefined
  }

  function beginModelLoad(nextModelId: string) {
    clearLoadedModel()
    modelId.value = nextModelId
    expressions.beginModel(nextModelId)
    error.value = undefined
    phase.value = 'loading'
  }

  function setModel(
    instance: PixiLive2DModel<PixiLive2DInternalModel>,
    nextInternalModel: PixiLive2DInternalModel,
  ) {
    modelInstance.value = instance
    internalModel.value = nextInternalModel
    error.value = undefined
    phase.value = 'ready'
  }

  function reportError(errorPhase: Live2DErrorPhase, value: unknown) {
    error.value = {
      phase: errorPhase,
      cause: errorFrom(value),
    }
    phase.value = 'error'
  }

  function render() {
    if (!app.value)
      return false

    try {
      app.value.render()
      return true
    }
    catch (cause) {
      reportError('render', cause)
      return false
    }
  }

  function captureFrame() {
    return new Promise<Blob | null>((resolve) => {
      if (!canvas.value || !render()) {
        resolve(null)
        return
      }

      canvas.value.toBlob(resolve)
    })
  }

  function dispose() {
    unload()
    app.value = undefined
    canvas.value = undefined
    lastSource = undefined
    phase.value = 'disposed'
  }

  return {
    source,
    modelId,
    revision,
    phase,
    error,
    renderer: {
      app,
      canvas,
      captureFrame,
      render,
    },
    model: {
      instance: modelInstance,
      internalModel,
    },
    expressions,
    motions,
    load,
    unload,
    reload,
    dispose,
    setRenderer,
    clearRenderer,
    beginModelLoad,
    setModel,
    reportError,
  }
}

/** Provides one Live2D runtime to the current component subtree. */
export function provideLive2D(context: Live2DContext) {
  provide(live2DContextKey, context)
}

/** Returns the Live2D runtime from the nearest Root component. */
export function useLive2D(): Live2DContext {
  const context = inject(live2DContextKey)
  if (!context)
    throw new Error('useLive2D() requires a parent Live2DRoot component.')
  return context
}

/** Returns the Pixi renderer interface from the nearest Live2D Root. */
export function useLive2DRenderer(): Live2DRendererContext {
  return useLive2D().renderer
}

/** Returns the model interface from the nearest Live2D Root. */
export function useLive2DModel(): Live2DModelContext {
  return useLive2D().model
}

/** Returns the expression interface from the nearest Live2D Root. */
export function useLive2DExpressions(): Live2DExpressionsContext {
  return useLive2D().expressions
}

/** Returns the motion interface from the nearest Live2D Root. */
export function useLive2DMotions(): Live2DMotionsContext {
  return useLive2D().motions
}
