<script setup lang="ts">
import { useSceneReady } from '@proj-airi/vishot-runtime/vue'

import stageShot from '../../../../artifacts/raw/00-stage-tamagotchi.avif'
import websocketSettingsShot from '../../../../artifacts/raw/03-websocket-settings.avif'
import chatWindowShot from '../../../../artifacts/raw/04-chat-window.avif'
import SceneCaptureLayout from './components/scene-capture-layout.vue'

import { WindowRoot } from '../../../components/platforms/macos-26/containers/window'

useSceneReady([
  stageShot,
  websocketSettingsShot,
  chatWindowShot,
])
</script>

<route lang="yaml">
meta:
  title: Setup And Use
</route>

<template>
  <SceneCaptureLayout name="manual-chat-window" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '72px', transform: 'translateX(-50%)' }">
        <img :src="chatWindowShot" :class="['w-150']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="intro-chat-window" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot
        :style="{ right: '0px', bottom: '0px' }"
        anchor-to="bottom-right"
        anchor-bounds="workarea"
        :frame="false"
        :has-shadow="false"
      >
        <img :src="stageShot" :class="['w-95']">
      </WindowRoot>

      <WindowRoot :style="{ left: '480px', top: '120px' }">
        <img :src="websocketSettingsShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>
</template>
