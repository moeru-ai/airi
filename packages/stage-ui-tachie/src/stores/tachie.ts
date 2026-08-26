import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/** Supported ranges and defaults for persisted Tachie appearance controls. */
export const tachieControlConfig = {
  renderScale: { default: 2, max: 2, min: 0.5, step: 0.25 },
  scale: { default: 1, max: 3, min: 0.1, step: 0.01 },
  x: { default: 0, max: 3000, min: -3000, step: 1 },
  y: { default: 0, max: 3000, min: -3000, step: 1 },
} as const

/**
 * Persisted appearance and viewport calibration for the Tachie renderer.
 */
export const useTachie = defineStore('tachie', () => {
  const position = useLocalStorageManualReset('settings/tachie/position', {
    x: tachieControlConfig.x.default,
    y: tachieControlConfig.y.default,
  })
  const scale = useLocalStorageManualReset('settings/tachie/scale', tachieControlConfig.scale.default)
  const renderScale = useLocalStorageManualReset('settings/tachie/render-scale', tachieControlConfig.renderScale.default)
  const shadowEnabled = useLocalStorageManualReset('settings/tachie/shadow-enabled', true)

  function resetState() {
    position.reset()
    scale.reset()
    renderScale.reset()
    shadowEnabled.reset()
  }

  return {
    position,
    renderScale,
    resetState,
    scale,
    shadowEnabled,
  }
})
