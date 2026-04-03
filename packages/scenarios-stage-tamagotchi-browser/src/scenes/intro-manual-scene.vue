<script setup lang="ts">
import { markScenarioReady, resetScenarioReady } from '@proj-airi/vishot-runtime'
import { ScenarioCanvas, ScenarioCaptureRoot } from '@proj-airi/vishot-runtime/vue'
import { onMounted } from 'vue'

import stageShot from '../../artifacts/raw/00-stage-tamagotchi.png'
import websocketSettingsShot from '../../artifacts/raw/04-websocket-settings.png'
import Icon from '../components/icon.vue'

import { PlatformRoot } from '../components/platforms/macos-26'
import { Application } from '../components/platforms/macos-26/containers/dock'
import { WindowRoot } from '../components/platforms/macos-26/containers/window'

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
  <ScenarioCanvas>
    <ScenarioCaptureRoot name="intro-chat-window">
      <PlatformRoot :dock-size="1.5">
        <template #windows>
          <WindowRoot class="translate-x-300 translate-y-100" :frame="false" :has-shadow="false">
            <img :src="stageShot" class="w-95">
          </WindowRoot>
          <WindowRoot class="translate-x-120 translate-y-30">
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
