<script setup lang="ts">
import { ScreenHighlightRegion, useSceneReady } from '@proj-airi/vishot-runtime/vue'

import stageShot from '../../../../artifacts/raw/00-stage-tamagotchi.avif'
import websocketSettingsShot from '../../../../artifacts/raw/03-websocket-settings.avif'
import SceneCaptureLayout from './components/scene-capture-layout.vue'

import { WindowRoot } from '../../../components/platforms/macos-26/containers/window'

useSceneReady([
  stageShot,
  websocketSettingsShot,
])
</script>

<route lang="yaml">
meta:
  title: Setup And Use Intro Websocket
</route>

<template>
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
        <div :class="['relative']">
          <img :src="websocketSettingsShot" :class="['w-120']">
          <div
            :class="[
              'absolute inset-0',
              'pointer-events-none',
            ]"
          >
            <ScreenHighlightRegion
              :class="[
                'absolute left-2.5 top-22',
                'w-[calc(100%-(16px*2))] h-20',
                'translate-x-[8px]',
              ]"
              :inset="3"
              border-color="border-yellow-500 dark:border-yellow-400"
            />
            <ScreenHighlightRegion
              :class="[
                'absolute left-2.5 top-78',
                'w-[calc(100%-(16px*2))] h-26',
                'translate-x-[8px]',
              ]"
              :inset="3"
              border-color="border-cyan-400 dark:border-cyan-300"
            />
          </div>
        </div>
      </WindowRoot>
    </template>
  </SceneCaptureLayout>
</template>
