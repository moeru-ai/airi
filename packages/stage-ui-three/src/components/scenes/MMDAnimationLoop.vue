<script setup lang="ts">
/**
 * MMD Animation Loop Component
 * - Runs inside TresCanvas context to properly use useLoop()
 * - Handles animation mixer updates and skeleton updates synchronized with rendering
 */

import type { AnimationMixer, Group } from 'three'
import type { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js'

import { useLoop } from '@tresjs/core'
import { onUnmounted, watch } from 'vue'

const props = defineProps<{
  mixer?: AnimationMixer | null
  mmdGroup?: Group | null
  ikSolver?: CCDIKSolver | null
  ikEnabled?: boolean
  paused?: boolean
}>()

// Must call useLoop at setup top level (Vue composition function rule)
const { onBeforeRender, stop, start } = useLoop()

// Debug logging (every 2 seconds)
let lastLoggedSecond = -1

// Setup the render loop callback
const disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
  // Skip if paused or no mixer/group
  if (props.paused || (!props.mixer && !props.mmdGroup)) {
    return
  }

  // Update animation mixer - this sets bone transforms from animation
  if (props.mixer) {
    props.mixer.update(delta)
  }

  // Update skeleton bones after animation
  if (props.mmdGroup) {
    props.mmdGroup.traverse((child) => {
      const mesh = child as any
      if (mesh.isMesh && mesh.skeleton) {
        const skel = mesh.skeleton

        // CRITICAL: Sync deform bones (D bones) with main bones
        // PMX models use separate D bones that vertices bind to
        // These must copy the main bone transforms to deform the mesh
        const boneSyncPairs: Array<{ main: string, d: string }> = [
          { main: '左足', d: '左足D' },
          { main: '左ひざ', d: '左ひざD' },
          { main: '左足首', d: '左足首D' },
          { main: '右足', d: '右足D' },
          { main: '右ひざ', d: '右ひざD' },
          { main: '右足首', d: '右足首D' },
        ]

        boneSyncPairs.forEach((pair) => {
          const mainBone = skel.bones.find((b: any) => b.name === pair.main)
          const dBone = skel.bones.find((b: any) => b.name === pair.d)

          if (mainBone && dBone) {
            // Copy transform from main bone to D bone
            dBone.position.copy(mainBone.position)
            dBone.quaternion.copy(mainBone.quaternion)
            dBone.scale.copy(mainBone.scale)
          }
        })

        // Update bone matrices from current bone transforms
        skel.update()

        // CRITICAL: Manually update boneTexture data for GPU
        // Three.js DataTexture needs explicit data copy
        if (skel.boneTexture && skel.boneMatrices) {
          const texture = skel.boneTexture
          const matrices = skel.boneMatrices

          // Check if texture.image.data exists and is the right size
          if (texture.image && texture.image.data) {
            // Copy updated bone matrices to texture data
            texture.image.data.set(matrices)
            texture.needsUpdate = true
          }
        }

        // Ensure the mesh knows its bones have changed
        mesh.matrixWorldNeedsUpdate = true
      }
    })
  }

  // Update IK solver if in IK mode (not FK mode)
  if (props.ikSolver && props.ikEnabled) {
    try {
      props.ikSolver.update()
    }
    catch (err) {
      console.warn('[MMD IK] IK update error:', err)
    }
  }

  // Debug logging (keep minimal for production)
  // Remove or set to false to disable debug logs
  const DEBUG = false
  if (DEBUG) {
    const currentTime = performance.now()
    const seconds = Math.floor(currentTime / 1000)
    if (seconds % 2 === 0 && seconds !== lastLoggedSecond) {
      lastLoggedSecond = seconds
      const mesh = props.mmdGroup?.children[0] as any
      if (mesh?.skeleton) {
        const skel = mesh.skeleton
        const leftKneeD = skel.bones.find((b: any) => b.name === '左ひざD')
        if (leftKneeD) {
          console.log(`[MMD] 左ひざD quaternion:`, leftKneeD.quaternion.toArray().map((v: number) => v.toFixed(3)))
        }
      }
    }
  }
}).off

// Handle paused state
watch(() => props.paused, (paused) => {
  if (paused) {
    stop()
  }
  else {
    start()
  }
}, { immediate: true })

onUnmounted(() => {
  disposeBeforeRenderLoop?.()
})
</script>

<template>
  <slot />
</template>
