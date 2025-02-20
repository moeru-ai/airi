<script setup lang="ts">
import type { Mesh } from 'three'

import { useRenderLoop } from '@tresjs/core'
import { IcosahedronGeometry, ShaderMaterial } from 'three'
import { computed, ref } from 'vue'

const props = defineProps<{
  ready: boolean
  active: boolean
  frequency: number
}>()
const MIN_WAVE_SIZE = 10
const AUDIO_SCALE = 0.5
const MAX_WAVE_SIZE = 60

const { onLoop } = useRenderLoop()

const colors = computed(() => ({
  red: props.ready ? (props.active ? 1 : 0) : 0.1,
  green: props.ready ? (props.active ? 0 : 1) : 0.1,
  blue: props.ready ? (props.active ? 1 : 0) : 0.1,
}))

const mesh = ref<Mesh>()
const geometry = computed(() => {
  return new IcosahedronGeometry(3, 20)
})
const material = computed(() => {
  return new ShaderMaterial({
    uniforms: {
      u_time: { value: 0.0 },
      u_frequency: { value: 0.0 },
      u_red: { value: 0.0 },
      u_green: { value: 0.0 },
      u_blue: { value: 0.0 },
    },
    vertexShader: document.getElementById('vertexshader')!.textContent || '',
    fragmentShader: document.getElementById('fragmentshader')!.textContent || '',
    wireframe: true,
  })
})

const uniforms = material.value.uniforms

onLoop(({ clock }) => {
  const time = clock.getElapsedTime()

  uniforms.u_time.value = time
  uniforms.u_frequency.value = Math.min(
    MIN_WAVE_SIZE + AUDIO_SCALE * props.frequency,
    MAX_WAVE_SIZE,
  )
  uniforms.u_red.value = colors.value.red
  uniforms.u_green.value = colors.value.green
  uniforms.u_blue.value = colors.value.blue
})
</script>

<template>
  <TresMesh ref="mesh" :geometry="geometry" :material="material" />
</template>
