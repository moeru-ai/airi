<script lang="ts" setup>
import type { BlendFunction } from 'postprocessing'

import { HueSaturationEffect } from 'postprocessing'

import { useEffectPmndrs } from '../../composables/use-effect-pmndrs'
import { makePropWatchers } from '../../utils'

export interface HueSaturationPmndrsProps {
  /**
   * The saturation adjustment. A value of 0.0 results in grayscale, and 1.0 leaves saturation unchanged.
   * Range: [0.0, 1.0]
   */
  saturation?: number

  /**
   * The hue adjustment in radians.
   * Range: [-π, π] (or [0, 2π] for a full rotation)
   */
  hue?: number

  /**
   * The blend function. Defines how the effect blends with the original scene.
   */
  blendFunction?: BlendFunction
}

const props = defineProps<HueSaturationPmndrsProps>()

const { pass, effect } = useEffectPmndrs(() => new HueSaturationEffect(props), props)

defineExpose({ pass, effect })

makePropWatchers(
  [
    [() => props.blendFunction, 'blendMode.blendFunction'],
    [() => props.hue, 'hue'],
    [() => props.saturation, 'saturation'],
  ],
  effect,
  () => new HueSaturationEffect(),
)
</script>

<template>
  <slot />
</template>
