<script setup lang="ts">
import { extend, useTresContext } from '@tresjs/core'
import { storeToRefs } from 'pinia'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onMounted, shallowRef } from 'vue'

import * as THREE from 'three'

import { useVRM } from '../../../stores'

extend({ OrbitControls })

const { camera, renderer } = useTresContext()
const controls = shallowRef<OrbitControls>()
const {
  modelSize,
} = storeToRefs(useVRM())

// initialize the OrbitControls
onMounted(() => {
  if (camera.value && renderer.value?.domElement) {
    controls.value = new OrbitControls(camera.value, renderer.value.domElement)
    controls.value.enableDamping = true
    controls.value.dampingFactor = 0.5

    // Align to tresjs conventions
    controls.value.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    controls.value.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }

    controls.value.enablePan = false
    controls.value.minDistance = modelSize.value.z

    controls.value.update()
  }
})
</script>

<template>
  <slot />
</template>
