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
export type Live2DErrorPhase = 'renderer' | 'model' | 'render'

/** Error reported by one Live2D Root. */
export interface Live2DError {
  phase: Live2DErrorPhase
  cause: Error
}

/** Public state and commands for one Live2D Root instance. */
export interface Live2DContext {
  source: Readonly<ShallowRef<string | undefined>>
  modelId: Readonly<ShallowRef<string>>
  /** Changes whenever the source must create a fresh model instance. */
  revision: Readonly<ShallowRef<number>>
  phase: Readonly<ShallowRef<Live2DPhase>>
  error: Readonly<ShallowRef<Live2DError | undefined>>
  expressions: Live2DExpressionsContext
  motions: Live2DMotionsContext
  load: (source: string, modelId?: string) => void
  unload: () => void
  dispose: () => void
  beginModelLoad: (modelId: string) => void
  setModel: (internalModel: PixiLive2DInternalModel) => void
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
  let internalModel: PixiLive2DInternalModel | undefined
  const defaultControlPolicy = createLive2DControlPolicy()

  function controlPolicy() {
    return toValue(options.controlPolicy) ?? defaultControlPolicy
  }

  const expressions = createLive2DExpressionsContext({
    getParameterDefault(parameterId) {
      const coreModel = internalModel?.coreModel
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

    source.value = nextSource
    modelId.value = nextModelId ?? nextSource
    revision.value += 1
    error.value = undefined
    phase.value = 'loading'
  }

  function clearLoadedModel() {
    expressions.clear()
    motions.clear()
    internalModel = undefined
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

  function beginModelLoad(nextModelId: string) {
    clearLoadedModel()
    modelId.value = nextModelId
    error.value = undefined
    phase.value = 'loading'
  }

  function setModel(nextInternalModel: PixiLive2DInternalModel) {
    internalModel = nextInternalModel
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

  function dispose() {
    unload()
    phase.value = 'disposed'
  }

  return {
    source,
    modelId,
    revision,
    phase,
    error,
    expressions,
    motions,
    load,
    unload,
    dispose,
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
