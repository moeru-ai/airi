import type { Live2DContext } from '@proj-airi/stage-ui-live2d'
import type {} from 'pinia-plugin-synced'
import type { MaybeRefOrGetter } from 'vue'

import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

export * from '@proj-airi/stage-ui-live2d/stores'

/** Identifies the Avatar Model and expressions selected for temporary preview. */
export interface Live2DExpressionPreview {
  /** Settings window that owns the preview. */
  ownerId: string
  /** The Character-owned Avatar Model that receives the preview. */
  avatarModelId: string
  /** Exact expression names from the selected model manifest. */
  names: string[]
  /** Time when renderers must stop applying the preview without a renewal. */
  expiresAt: number
}

const emptyExpressionNames: ReadonlySet<string> = new Set()
/** A stopped settings window leaves no expression active after this interval. */
const expressionPreviewLeaseMs = 10_000

/** Owns non-persistent Live2D controls that synchronized Stage renderers observe. */
export const useSharedLive2D = defineStore('shared-live2d', () => {
  const expressionPreview = shallowRef<Live2DExpressionPreview | null>(null)

  async function startPreviewingExpression(avatarModelId: string, name: string, ownerId: string) {
    const current = expressionPreview.value
    if (current?.ownerId === ownerId && current.avatarModelId === avatarModelId && current.names.includes(name))
      return

    const names = current?.ownerId === ownerId && current.avatarModelId === avatarModelId
      ? [...current.names, name]
      : [name]
    expressionPreview.value = {
      ownerId,
      avatarModelId,
      names,
      expiresAt: Date.now() + expressionPreviewLeaseMs,
    }
  }

  async function stopPreviewingExpression(avatarModelId: string, name: string, ownerId: string) {
    const current = expressionPreview.value
    if (current?.ownerId !== ownerId || current.avatarModelId !== avatarModelId || !current.names.includes(name))
      return

    const names = current.names.filter(currentName => currentName !== name)
    expressionPreview.value = names.length > 0
      ? { ...current, names }
      : null
  }

  async function stopPreviewingAllExpressions(avatarModelId: string, ownerId: string) {
    if (expressionPreview.value?.ownerId !== ownerId || expressionPreview.value.avatarModelId !== avatarModelId)
      return

    expressionPreview.value = null
  }

  async function renewExpressionPreview(ownerId: string) {
    const current = expressionPreview.value
    if (current?.ownerId !== ownerId || Date.now() >= current.expiresAt)
      return

    expressionPreview.value = { ...current, expiresAt: Date.now() + expressionPreviewLeaseMs }
  }

  async function expireExpressionPreview(ownerId: string, expiresAt: number) {
    const current = expressionPreview.value
    if (current?.ownerId !== ownerId || current.expiresAt !== expiresAt || Date.now() < expiresAt)
      return

    expressionPreview.value = null
  }

  watch(expressionPreview, (preview, _, onCleanup) => {
    if (!preview)
      return

    const timer = setTimeout(async () => {
      try {
        await expireExpressionPreview(preview.ownerId, preview.expiresAt)
      }
      catch (error) {
        console.warn('[Live2D] Failed to expire synchronized expression preview:', error)
      }
    }, Math.max(0, preview.expiresAt - Date.now()))
    onCleanup(() => clearTimeout(timer))
  }, { immediate: true })

  return {
    expressionPreview,
    startPreviewingExpression,
    stopPreviewingExpression,
    stopPreviewingAllExpressions,
    renewExpressionPreview,
    expireExpressionPreview,
  }
}, {
  synced: {
    actions: [
      'startPreviewingExpression',
      'stopPreviewingExpression',
      'stopPreviewingAllExpressions',
      'renewExpressionPreview',
      'expireExpressionPreview',
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
    ([preview, currentAvatarModelId, currentModelId, definitions], _, onCleanup) => {
      if (preview && preview.expiresAt > Date.now()) {
        const timer = setTimeout(stopAppliedExpressions, preview.expiresAt - Date.now())
        onCleanup(() => clearTimeout(timer))
      }

      if (currentModelId !== appliedModelId || definitions !== appliedDefinitions) {
        appliedExpressionNames.clear()
        appliedModelId = currentModelId
        appliedDefinitions = definitions
      }

      const desiredExpressionNames = preview && preview.expiresAt > Date.now() && preview.avatarModelId === currentAvatarModelId
        ? new Set(preview.names.filter(name => definitions.has(name)))
        : emptyExpressionNames

      let removedExpression = false
      for (const name of appliedExpressionNames) {
        if (desiredExpressionNames.has(name))
          continue

        live2d.expressions.setActive(name, false)
        removedExpression = true
      }

      const nextAppliedExpressionNames = new Set<string>()
      for (const name of desiredExpressionNames) {
        if ((!removedExpression && appliedExpressionNames.has(name)) || live2d.expressions.setActive(name, true).success)
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
