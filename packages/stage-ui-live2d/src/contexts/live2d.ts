import type { InjectionKey, MaybeRefOrGetter } from 'vue'

import type { PixiLive2DInternalModel } from '../composables/live2d/motion-manager'
import type { Live2DControlPolicy } from '../types/avatar-model'
import type { Live2DExpressionsContext } from './expressions'
import type { Live2DMotionsContext } from './motions'

import { inject, provide, toValue } from 'vue'

import { createLive2DControlPolicy, isLive2DControlEnabled } from '../controls/policy'
import { createLive2DExpressionsContext } from './expressions'
import { createLive2DMotionsContext } from './motions'

/** Expression and motion controls for one Live2D Root instance. */
export interface Live2DContext {
  expressions: Live2DExpressionsContext
  motions: Live2DMotionsContext
  /** Clears the controls of the previous model. */
  beginModelLoad: () => void
  setModel: (internalModel: PixiLive2DInternalModel) => void
  dispose: () => void
}

export interface CreateLive2DOptions {
  /** Character-owned control policy for the selected Avatar Model. */
  controlPolicy?: MaybeRefOrGetter<Live2DControlPolicy | undefined>
}

const live2DContextKey: InjectionKey<Live2DContext> = Symbol('live2d-context')

/** Creates one isolated Live2D runtime for a Root component. */
export function createLive2D(options: CreateLive2DOptions = {}): Live2DContext {
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

  function beginModelLoad() {
    expressions.clear()
    motions.clear()
    internalModel = undefined
  }

  function setModel(nextInternalModel: PixiLive2DInternalModel) {
    internalModel = nextInternalModel
  }

  return {
    expressions,
    motions,
    beginModelLoad,
    setModel,
    dispose: beginModelLoad,
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
