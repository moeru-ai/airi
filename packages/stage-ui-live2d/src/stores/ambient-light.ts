import type { AmbientLightEnvironment } from '@proj-airi/stage-shared/screen-ambient-light'

import { ambientLightNeutralEnvironment } from '@proj-airi/stage-shared/screen-ambient-light'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Holds the latest screen-derived environment for the active Live2D renderer. */
export const useLive2DAmbientLight = defineStore('live2d-ambient-light', () => {
  const environment = shallowRef<AmbientLightEnvironment>(ambientLightNeutralEnvironment)
  const active = shallowRef(false)

  function setEnvironment(next: AmbientLightEnvironment) {
    environment.value = next
    active.value = true
  }

  function reset() {
    environment.value = ambientLightNeutralEnvironment
    active.value = false
  }

  return {
    environment,
    active,
    setEnvironment,
    reset,
  }
})
