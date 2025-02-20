<script setup lang="ts">
import { extend, useLoop, useTres } from '@tresjs/core'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { shallowRef, watch } from 'vue'

const props = defineProps<{
  frequency: number
}>()

extend({ EffectComposer, OutputPass, UnrealBloomPass, RenderPass })

const { renderer, scene, camera, sizes } = useTres()
const composer = shallowRef<EffectComposer>()

useLoop().render(() => {
  if (composer.value) {
    composer.value!.render()
  }
})

watch([sizes.width, sizes.height], () => {
  composer.value?.setSize(sizes.width.value, sizes.height.value)
})
</script>

<template>
  <TresEffectComposer
    ref="composer"
    :args="[renderer]"
    :set-size="[sizes.width.value, sizes.height.value]"
  >
    <TresRenderPass
      :args="[scene, camera]"
      attach="passes-0"
    />
    <TresUnrealBloomPass
      :args="[[sizes.width, sizes.height], 0.2, 1, 0]"
      :strength="0.2 + props.frequency / 1000"
      attach="passes-1"
    />
    <TresOutputPass
      attach="passes-2"
      :set-size="[sizes.width.value, sizes.height.value]"
    />
  </TresEffectComposer>
</template>
