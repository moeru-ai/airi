<script setup lang="ts">
import { markScenarioReady, resetScenarioReady } from '@proj-airi/vishot-runtime'
import { ScenarioCanvas, ScenarioCaptureRoot } from '@proj-airi/vishot-runtime/vue'
import { onMounted } from 'vue'

import stageShot from '../../artifacts/raw/00-stage-tamagotchi.png'
import websocketSettingsShot from '../../artifacts/raw/03-websocket-settings.png'
import Icon from '../components/icon.vue'

import { PlatformRoot } from '../components/platforms/macos-26'
import { Application } from '../components/platforms/macos-26/containers/dock'
import { WindowRoot } from '../components/platforms/macos-26/containers/window'

/**
 * These coordinates are expressed in the logical `1920x1080` canvas provided by
 * `ScenarioCanvas`, not in the browser's live viewport.
 *
 * That is why the windows keep their relative placement when the viewport size
 * changes: the browser scales the entire fixed scene surface after layout rather
 * than reinterpreting each translate against a resized responsive container.
 */
const stageWindowStyle = {
  right: '0px',
  bottom: '0px',
}

const websocketWindowStyle = {
  left: '480px',
  top: '120px',
}

async function waitForImageSource(source: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const image = new Image()

    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => reject(new Error(`Scenario image failed to load: ${source}`)), { once: true })
    image.src = source
  })
}

onMounted(async () => {
  resetScenarioReady()
  try {
    await Promise.all([
      document.fonts.ready,
      waitForImageSource(stageShot),
      waitForImageSource(websocketSettingsShot),
    ])
    markScenarioReady()
  }
  catch (error) {
    console.error(error)
  }
})
</script>

<template>
  <ScenarioCanvas :width="1920" :height="1080">
    <ScenarioCaptureRoot name="intro-chat-window">
      <PlatformRoot :dock-size="1.5">
        <template #windows>
          <WindowRoot
            :style="stageWindowStyle"
            anchor-to="bottom-right"
            anchor-bounds="workarea"
            :frame="false"
            :has-shadow="false"
          >
            <img :src="stageShot" class="w-95">
          </WindowRoot>
          <WindowRoot :style="websocketWindowStyle">
            <img :src="websocketSettingsShot" class="w-120">
          </WindowRoot>
        </template>
        <template #dock>
          <Application running>
            <Icon />
          </Application>
        </template>
      </PlatformRoot>
    </ScenarioCaptureRoot>
  </ScenarioCanvas>
</template>
