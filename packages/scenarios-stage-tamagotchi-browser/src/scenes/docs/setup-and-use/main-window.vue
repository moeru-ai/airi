<script setup lang="ts">
import { useSceneReady } from '@proj-airi/vishot-runtime/vue'

import stageShot from '../../../../artifacts/raw/00-stage-tamagotchi.avif'
import controlsIslandShot from '../../../../artifacts/raw/01-controls-island-expanded.avif'
import SceneCaptureLayout from './components/scene-capture-layout.vue'

import { WindowRoot } from '../../../components/platforms/macos-26/containers/window'

useSceneReady([
  stageShot,
  controlsIslandShot,
])
</script>

<route lang="yaml">
meta:
  title: Setup And Use Main Window
</route>

<template>
  <SceneCaptureLayout name="manual-main-window" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot
        :style="{ right: '0px', bottom: '0px' }"
        anchor-to="bottom-right"
        anchor-bounds="workarea"
        :frame="false"
        :has-shadow="false"
      >
        <img :src="stageShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-controls-island-expanded" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot
        :style="{ right: '0px', bottom: '0px' }"
        anchor-to="bottom-right"
        anchor-bounds="workarea"
        :frame="false"
        :has-shadow="false"
      >
        <img :src="controlsIslandShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>
</template>
