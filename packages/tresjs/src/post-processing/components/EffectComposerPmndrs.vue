<!--
  https://github.com/Tresjs/post-processing/blob/c89b5b4353d889d58da4dd6746e64b32a3f711ec/src/core/pmndrs/EffectComposerPmndrs.vue
-->

<script lang="ts">
import type { EffectComposer } from 'postprocessing'
import type { WebGLRenderer } from 'three'
import type { InjectionKey, ShallowRef } from 'vue'

import WEBGL from 'three/examples/jsm/capabilities/WebGL.js'

import { useTres, useTresContext } from '@tresjs/core'
import {
  DepthDownsamplingPass,
  EffectComposer as EffectComposerImpl,
  NormalPass,
  RenderPass,
} from 'postprocessing'
import { HalfFloatType } from 'three'
import { computed, onUnmounted, provide, shallowRef, watch } from 'vue'

export const effectComposerInjectionKey: InjectionKey<ShallowRef<EffectComposer | null>> = Symbol('effectComposerPmndrs')

export interface EffectComposerPmndrsProps {
  enabled?: boolean
  depthBuffer?: boolean
  disableNormalPass?: boolean
  stencilBuffer?: boolean
  resolutionScale?: number
  autoClear?: boolean
  multisampling?: number
  frameBufferType?: number
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<EffectComposerPmndrsProps>(), {
  enabled: true,
  autoClear: true,
  frameBufferType: HalfFloatType,
  disableNormalPass: false,
  depthBuffer: undefined,
  multisampling: 0,
  stencilBuffer: undefined,
})
const emit = defineEmits(['render'])

const { renderer } = useTresContext()
const { scene, camera, sizes } = useTres()

const effectComposer: ShallowRef<EffectComposerImpl | null> = shallowRef(null)

let downSamplingPass: DepthDownsamplingPass | null = null
let normalPass: NormalPass | null = null

provide(effectComposerInjectionKey, effectComposer)
defineExpose({ composer: effectComposer })

function setNormalPass() {
  if (!effectComposer.value) {
    return
  }

  normalPass = new NormalPass(scene.value, camera.value)
  normalPass.enabled = false
  effectComposer.value.addPass(normalPass)
  if (props.resolutionScale !== undefined && WEBGL.isWebGL2Available()) {
    downSamplingPass = new DepthDownsamplingPass({
      normalBuffer: normalPass.texture,
      resolutionScale: props.resolutionScale,
    })

    downSamplingPass.enabled = false
    effectComposer.value.addPass(downSamplingPass)
  }
}

const effectComposerParams = computed(() => {
  const plainEffectComposer = new EffectComposerImpl()
  const params = {
    depthBuffer: props.depthBuffer !== undefined
      ? props.depthBuffer
      : plainEffectComposer.inputBuffer.depthBuffer,
    stencilBuffer:
      props.stencilBuffer !== undefined
        ? props.stencilBuffer
        : plainEffectComposer.inputBuffer.stencilBuffer,
    multisampling: WEBGL.isWebGL2Available()
      ? props.multisampling !== undefined
        ? props.multisampling
        : plainEffectComposer.multisampling
      : 0,
    frameBufferType: props.frameBufferType !== undefined
      ? props.frameBufferType
      : HalfFloatType,
  }

  plainEffectComposer.dispose()

  return params
})

function initEffectComposer() {
  if (!renderer && !scene.value && !camera.value) {
    return
  }

  effectComposer.value?.dispose()
  effectComposer.value = new EffectComposerImpl(renderer.instance as WebGLRenderer, effectComposerParams.value)
  effectComposer.value.addPass(new RenderPass(scene.value, camera.value))

  if (!props.disableNormalPass) {
    setNormalPass()
  }
}

watch([scene, camera, () => props.disableNormalPass], () => {
  if (!sizes.width.value || !sizes.height.value) {
    return
  }

  initEffectComposer()
})

watch(() => [sizes.width.value, sizes.height.value], ([width, height]) => {
  // effect composer should only live once the canvas has a size > 0
  if (!width && !height) {
    return
  }

  if (effectComposer.value) {
    effectComposer.value.setSize(width, height)
  }
  else {
    initEffectComposer()
  }
}, {
  immediate: true,
})

renderer.replaceRenderFunction((notifySuccess) => {
  if (props.enabled && renderer.instance && effectComposer.value && sizes.width.value && sizes.height.value) {
    const currentAutoClear = renderer.instance.autoClear
    renderer.instance.autoClear = props.autoClear
    if (props.stencilBuffer && !props.autoClear) {
      renderer.instance.clearStencil()
    }

    effectComposer.value.render()
    emit('render', effectComposer.value)
    renderer.instance.autoClear = currentAutoClear
    notifySuccess()
  }
})

onUnmounted(() => {
  effectComposer.value?.dispose()
})
</script>

<template>
  <slot />
</template>
