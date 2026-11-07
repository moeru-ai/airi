import type { Live2DContext } from '@proj-airi/stage-ui-live2d'
import type { Live2DExpressionParameterControl } from '@proj-airi/stage-ui-live2d/controls/manifest'

import type { Live2DPreviewTarget } from '../../../../stores/live2d'
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { defaultModelParameters, isLive2DControlEnabled, updateLive2DControlPolicy, useLive2dParams, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { OPFSCache } from '@proj-airi/stage-ui-live2d/utils/opfs-loader'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSharedLive2D } from '../../../../stores/live2d'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'

/** Sentinel option value that turns the idle motion off instead of selecting a model motion. */
export const DISABLED_IDLE_MOTION = '<motion disabled>'

const emptyExpressionPreviewNames: ReadonlySet<string> = new Set()
const emptyExpressionParameters: readonly Live2DExpressionParameterControl[] = Object.freeze([])

/**
 * Live2D model settings that more than one settings view edits: expression previews and AIRI access,
 * the idle motion, the blink mode, the model cache, and the face parameter reset.
 *
 * Each caller owns its own expression preview lease. The lease renews every 2 seconds while this caller
 * previews an expression, and it stops when the caller unmounts, when the character or avatar model
 * changes, or when the expression system is turned off.
 */
export function useLive2DModelSettings(options: {
  runtimeSnapshot: () => ModelSettingsRuntimeSnapshot
  live2dContext: () => Live2DContext | undefined
}) {
  const { t } = useI18n()

  const settings = useSettingsLive2d()
  const {
    live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    live2dExpressionEnabled,
  } = storeToRefs(settings)

  const live2d = useLive2dParams()
  const { modelParameters, currentMotion } = storeToRefs(live2d)

  const airiCardStore = useAiriCardStore()
  const {
    activeCardId,
    activeLive2DModelControls,
    selectedAvatarModel,
    selectedAvatarModelId,
  } = storeToRefs(airiCardStore)
  const sharedLive2D = useSharedLive2D()
  const { expressionPreview } = storeToRefs(sharedLive2D)
  const previewOwnerId = crypto.randomUUID()

  const activeExpressionPreviewNames = computed<ReadonlySet<string>>(() => {
    const preview = expressionPreview.value
    if (!preview || preview.ownerId !== previewOwnerId || preview.characterId !== activeCardId.value || preview.avatarModelId !== selectedAvatarModelId.value)
      return emptyExpressionPreviewNames

    return new Set(preview.names)
  })
  const canActivateExpressions = computed(() => {
    if (!live2dExpressionEnabled.value)
      return false

    // A Root context lists only the expressions that the loaded model registered.
    if (options.live2dContext())
      return true

    const snapshot = options.runtimeSnapshot()
    return snapshot.ownerInstanceId.length > 0
      && snapshot.renderer === 'live2d'
      && snapshot.phase === 'mounted'
  })
  const expressionItems = computed(() => activeLive2DModelControls.value.expressions.map((expression) => {
    const context = options.live2dContext()
    return {
      name: expression.name,
      fileName: expression.fileName,
      parameterCount: (
        expression.parameters
        ?? context?.expressions.definitions.value.get(expression.name)?.parameters
        ?? emptyExpressionParameters
      ).length,
      active: activeExpressionPreviewNames.value.has(expression.name),
      availableToAiri: selectedAvatarModel.value?.type === 'live2d'
        ? isLive2DControlEnabled(selectedAvatarModel.value.config.controls, {
            kind: 'expression',
            id: expression.name,
          })
        : false,
      activationDisabled: !canActivateExpressions.value
        || (context !== undefined && !context.expressions.definitions.value.has(expression.name)),
    }
  }))
  const hasActiveExpressionPreview = computed(() => activeExpressionPreviewNames.value.size > 0)

  async function setExpressionPreview(name: string, active: boolean) {
    const avatarModelId = selectedAvatarModelId.value
    if (!avatarModelId)
      return

    const target = { characterId: activeCardId.value, avatarModelId }
    if (active)
      await sharedLive2D.startPreviewingExpression(target, name, previewOwnerId)
    else
      await sharedLive2D.stopPreviewingExpression(target, name, previewOwnerId)
  }

  async function stopExpressionPreviews(target: Live2DPreviewTarget | undefined) {
    if (!target)
      return

    await sharedLive2D.stopPreviewingAllExpressions(target, previewOwnerId)
  }

  async function stopOwnedExpressionPreviews() {
    const preview = expressionPreview.value
    if (preview?.ownerId !== previewOwnerId)
      return

    await stopExpressionPreviews({ characterId: preview.characterId, avatarModelId: preview.avatarModelId })
  }

  async function setExpressionAvailableToAiri(name: string, available: boolean) {
    const avatarModel = selectedAvatarModel.value
    if (avatarModel?.type !== 'live2d')
      return

    const policy = updateLive2DControlPolicy(
      avatarModel.config.controls,
      { kind: 'expression', id: name },
      available,
    )
    await airiCardStore.updateLive2DControlPolicy(activeCardId.value, avatarModel.id, policy)
  }

  watch([activeCardId, selectedAvatarModelId], async ([characterId, avatarModelId], [previousCharacterId, previousAvatarModelId]) => {
    if (!previousAvatarModelId || (previousCharacterId === characterId && previousAvatarModelId === avatarModelId))
      return

    await stopExpressionPreviews({ characterId: previousCharacterId, avatarModelId: previousAvatarModelId })
  })

  watch(live2dExpressionEnabled, async (enabled) => {
    if (!enabled)
      await stopOwnedExpressionPreviews()
  })

  useIntervalFn(() => {
    const avatarModelId = selectedAvatarModelId.value
    if (avatarModelId && expressionPreview.value?.ownerId === previewOwnerId)
      void sharedLive2D.renewExpressionPreview({ characterId: activeCardId.value, avatarModelId }, previewOwnerId)
  }, 2_000)

  onBeforeUnmount(() => {
    void stopOwnedExpressionPreviews()
  })

  /**
   * The idle motion path that the motion picker shows. It is restored from the global `selected-runtime-motion`
   * key, so it is not scoped to one model, and it can name a motion that the current model does not have.
   */
  const selectedRuntimeMotion = ref<string>('')
  const runtimeMotions = computed(() => live2d.availableMotions.map(motion => ({
    name: motion.fileName.split('/').pop() || motion.fileName,
    displayPath: motion.fileName,
    group: motion.motionName,
    index: motion.motionIndex,
  })))
  const runtimeMotionOptions = computed(() => {
    const motionOptions = runtimeMotions.value.map(motion => ({
      label: motion.name,
      value: motion.displayPath,
      description: motion.displayPath,
    }))
    if (motionOptions.length === 0)
      return motionOptions

    return [
      {
        label: t('settings.live2d.animation.idle-motion.disable-motion'),
        value: DISABLED_IDLE_MOTION,
        description: t('settings.live2d.animation.idle-motion.disable-motion-description'),
      },
      ...motionOptions,
    ]
  })

  onMounted(() => {
    const savedPath = localStorage.getItem('selected-runtime-motion')
    if (savedPath)
      selectedRuntimeMotion.value = savedPath
  })

  /** Plays the selected model motion as the idle motion. Any value that is not a model motion turns the idle motion off. */
  function selectIdleMotion(selectedMotionPath: string | number | undefined) {
    if (typeof selectedMotionPath !== 'string')
      return

    selectedRuntimeMotion.value = selectedMotionPath
    const motion = runtimeMotions.value.find(item => item.displayPath === selectedMotionPath)
    if (!motion) {
      live2dIdleAnimationEnabled.value = false
      return
    }

    localStorage.setItem('selected-runtime-motion', motion.displayPath)
    localStorage.setItem('selected-runtime-motion-group', motion.group)
    localStorage.setItem('selected-runtime-motion-index', motion.index.toString())

    live2dIdleAnimationEnabled.value = true
    currentMotion.value = { group: motion.group, index: motion.index }
  }

  /**
   * `auto` lets the model blink on its own. `force` runs AIRI's blink timer. Choosing either mode turns blinking on.
   */
  const blinkMode = computed<'auto' | 'force'>({
    get() {
      return live2dForceAutoBlinkEnabled.value ? 'force' : 'auto'
    },
    set(mode) {
      live2dAutoBlinkEnabled.value = true
      live2dForceAutoBlinkEnabled.value = mode === 'force'
    },
  })

  function resetToDefaultParameters() {
    modelParameters.value = { ...defaultModelParameters }
  }

  const clearingCache = ref(false)

  /** Clears the cached files of every Live2D model, not only the selected one. Each model downloads again on next load. */
  async function clearModelCache() {
    clearingCache.value = true
    try {
      await OPFSCache.clearAll()
    }
    finally {
      clearingCache.value = false
    }
  }

  const canExtractColors = computed(() => options.runtimeSnapshot().canCapturePreview)

  return {
    expressionItems,
    canActivateExpressions,
    hasActiveExpressionPreview,
    setExpressionPreview,
    setExpressionAvailableToAiri,
    stopOwnedExpressionPreviews,
    selectedRuntimeMotion,
    runtimeMotionOptions,
    selectIdleMotion,
    blinkMode,
    resetToDefaultParameters,
    clearingCache,
    clearModelCache,
    canExtractColors,
  }
}
