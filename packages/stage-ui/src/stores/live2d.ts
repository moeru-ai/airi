import type { Live2DContext } from '@proj-airi/stage-ui-live2d'
import type {} from 'pinia-plugin-synced'
import type { MaybeRefOrGetter } from 'vue'

import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

export * from '@proj-airi/stage-ui-live2d/stores'

export interface Live2DPreviewTarget {
  characterId: string
  avatarModelId: string
}

/** Identifies the Character, Avatar Model, and expressions selected for temporary preview. */
export interface Live2DExpressionPreview extends Live2DPreviewTarget {
  /** Settings window that owns the preview. */
  ownerId: string
  /** Exact expression names from the selected model manifest. */
  names: string[]
  /** Time when renderers must stop applying the preview without a renewal. */
  expiresAt: number
}

/** A stopped settings window leaves no expression active after this interval. */
const expressionPreviewLeaseMs = 10_000

/** Owns non-persistent Live2D controls that synchronized Stage renderers observe. */
export const useSharedLive2D = defineStore('shared-live2d', () => {
  const expressionPreview = shallowRef<Live2DExpressionPreview | null>(null)

  async function startPreviewingExpression(target: Live2DPreviewTarget, name: string, ownerId: string) {
    const current = expressionPreview.value
    if (current?.ownerId === ownerId && current.characterId === target.characterId && current.avatarModelId === target.avatarModelId && current.names.includes(name))
      return

    const names = current?.ownerId === ownerId && current.characterId === target.characterId && current.avatarModelId === target.avatarModelId
      ? [...current.names, name]
      : [name]
    expressionPreview.value = {
      ownerId,
      ...target,
      names,
      expiresAt: Date.now() + expressionPreviewLeaseMs,
    }
  }

  async function stopPreviewingExpression(target: Live2DPreviewTarget, name: string, ownerId: string) {
    const current = expressionPreview.value
    if (current?.ownerId !== ownerId || current.characterId !== target.characterId || current.avatarModelId !== target.avatarModelId || !current.names.includes(name))
      return

    const names = current.names.filter(currentName => currentName !== name)
    expressionPreview.value = names.length > 0
      ? { ...current, names }
      : null
  }

  async function stopPreviewingAllExpressions(target: Live2DPreviewTarget, ownerId: string) {
    if (expressionPreview.value?.ownerId !== ownerId || expressionPreview.value.characterId !== target.characterId || expressionPreview.value.avatarModelId !== target.avatarModelId)
      return

    expressionPreview.value = null
  }

  async function renewExpressionPreview(target: Live2DPreviewTarget, ownerId: string) {
    const current = expressionPreview.value
    if (current?.ownerId !== ownerId || current.characterId !== target.characterId || current.avatarModelId !== target.avatarModelId || Date.now() >= current.expiresAt)
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
  characterId: MaybeRefOrGetter<string | undefined>,
  avatarModelId: MaybeRefOrGetter<string | undefined>,
) {
  const sharedLive2D = useSharedLive2D()
  const { expressionPreview } = storeToRefs(sharedLive2D)

  const stopSync = watch(
    [
      expressionPreview,
      () => toValue(characterId),
      () => toValue(avatarModelId),
      live2d.expressions.modelId,
      live2d.expressions.definitions,
    ],
    ([preview, currentCharacterId, currentAvatarModelId, , definitions], _, onCleanup) => {
      if (preview && preview.expiresAt > Date.now()) {
        const timer = setTimeout(() => live2d.expressions.setPreviewExpressions([]), preview.expiresAt - Date.now())
        onCleanup(() => clearTimeout(timer))
      }

      const names = preview && preview.expiresAt > Date.now() && preview.characterId === currentCharacterId && preview.avatarModelId === currentAvatarModelId
        ? preview.names.filter(name => definitions.has(name))
        : []
      live2d.expressions.setPreviewExpressions(names)
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    stopSync()
    live2d.expressions.setPreviewExpressions([])
  })
}
