import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/** Supported ranges and defaults for persisted Tachie appearance controls. */
export const tachieControlConfig = {
  x: { min: -3000, max: 3000, step: 1, default: 0 },
  y: { min: -3000, max: 3000, step: 1, default: 0 },
  scale: { min: 0.1, max: 3, step: 0.01, default: 1 },
  renderScale: { min: 0.5, max: 2, step: 0.25, default: 2 },
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
    scale,
    renderScale,
    shadowEnabled,
    resetState,
  }
})
