import type { Live2DContext } from '@proj-airi/stage-ui-live2d'
import type {} from 'pinia-plugin-synced'
import type { MaybeRefOrGetter } from 'vue'

import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

export * from '@proj-airi/stage-ui-live2d/stores'

/** Identifies the Avatar Model and expressions selected for temporary preview. */
export interface Live2DExpressionPreview {
  /** The Character-owned Avatar Model that receives the preview. */
  avatarModelId: string
  /** Exact expression names from the selected model manifest. */
  names: string[]
}

const emptyExpressionNames: ReadonlySet<string> = new Set()

/** Owns non-persistent Live2D controls that synchronized Stage renderers observe. */
export const useSharedLive2D = defineStore('shared-live2d', () => {
  const expressionPreview = shallowRef<Live2DExpressionPreview | null>(null)

  async function startPreviewingExpression(avatarModelId: string, name: string) {
    const current = expressionPreview.value
    if (current?.avatarModelId === avatarModelId && current.names.includes(name))
      return

    expressionPreview.value = {
      avatarModelId,
      names: current?.avatarModelId === avatarModelId
        ? [...current.names, name]
        : [name],
    }
  }

  async function stopPreviewingExpression(avatarModelId: string, name: string) {
    const current = expressionPreview.value
    if (current?.avatarModelId !== avatarModelId || !current.names.includes(name))
      return

    const names = current.names.filter(currentName => currentName !== name)
    expressionPreview.value = names.length > 0
      ? { avatarModelId, names }
      : null
  }

  async function stopPreviewingAllExpressions(avatarModelId: string) {
    if (expressionPreview.value?.avatarModelId !== avatarModelId)
      return

    expressionPreview.value = null
  }

  return {
    expressionPreview,
    startPreviewingExpression,
    stopPreviewingExpression,
    stopPreviewingAllExpressions,
  }
}, {
  synced: {
    actions: [
      'startPreviewingExpression',
      'stopPreviewingExpression',
      'stopPreviewingAllExpressions',
    ],
    state: true,
  },
})

/**
 * Applies matching shared expression previews to one local Live2D Root.
 * Scope disposal removes only the previews that this binding applied.
 */
export function useSharedLive2DExpressionPreview(
  live2d: Live2DContext,
  avatarModelId: MaybeRefOrGetter<string | undefined>,
) {
  const sharedLive2D = useSharedLive2D()
  const { expressionPreview } = storeToRefs(sharedLive2D)
  let appliedExpressionNames = new Set<string>()
  let appliedModelId = ''
  let appliedDefinitions = live2d.expressions.definitions.value

  function stopAppliedExpressions() {
    for (const name of appliedExpressionNames)
      live2d.expressions.setActive(name, false)
    appliedExpressionNames.clear()
  }

  const stopSync = watch(
    [
      expressionPreview,
      () => toValue(avatarModelId),
      live2d.expressions.modelId,
      live2d.expressions.definitions,
    ],
    ([preview, currentAvatarModelId, currentModelId, definitions]) => {
      if (currentModelId !== appliedModelId || definitions !== appliedDefinitions) {
        appliedExpressionNames.clear()
        appliedModelId = currentModelId
        appliedDefinitions = definitions
      }

      const desiredExpressionNames = preview && preview.avatarModelId === currentAvatarModelId
        ? new Set(preview.names.filter(name => definitions.has(name)))
        : emptyExpressionNames

      for (const name of appliedExpressionNames) {
        if (!desiredExpressionNames.has(name))
          live2d.expressions.setActive(name, false)
      }

      const nextAppliedExpressionNames = new Set<string>()
      for (const name of desiredExpressionNames) {
        if (appliedExpressionNames.has(name) || live2d.expressions.setActive(name, true).success)
          nextAppliedExpressionNames.add(name)
      }
      appliedExpressionNames = nextAppliedExpressionNames
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    stopSync()
    stopAppliedExpressions()
  })
}
