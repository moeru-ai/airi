<script setup lang="ts">
import { markScenarioReady, resetScenarioReady } from '@proj-airi/vishot-runtime'
import { ScenarioCanvas, ScenarioCaptureRoot } from '@proj-airi/vishot-runtime/vue'
import { onMounted } from 'vue'

import stageShot from '../../artifacts/raw/00-stage-tamagotchi.avif'
import controlsIslandShot from '../../artifacts/raw/01-controls-island-expanded.avif'
import settingsShot from '../../artifacts/raw/02-settings-window.avif'
import websocketSettingsShot from '../../artifacts/raw/03-websocket-settings.avif'
import chatWindowShot from '../../artifacts/raw/04-chat-window.avif'
import airiCardShot from '../../artifacts/raw/05-airi-card.avif'
import providersShot from '../../artifacts/raw/06-providers.avif'
import dataShot from '../../artifacts/raw/07-data.avif'
import systemGeneralShot from '../../artifacts/raw/08-system-general.avif'
import systemColorSchemeShot from '../../artifacts/raw/09-system-color-scheme.avif'
import modelsShot from '../../artifacts/raw/10-models.avif'
import modulesShot from '../../artifacts/raw/11-modules.avif'
import hearingShot from '../../artifacts/raw/12-hearing.avif'
import systemDeveloperShot from '../../artifacts/raw/13-system-developer.avif'
import consciousnessShot from '../../artifacts/raw/14-consciousness.avif'
import speechShot from '../../artifacts/raw/15-speech.avif'
import visionShot from '../../artifacts/raw/16-vision.avif'
import useWindowMouseShot from '../../artifacts/raw/17-devtools-use-window-mouse.avif'
import displaysShot from '../../artifacts/raw/18-devtools-displays.avif'
import widgetsCallingShot from '../../artifacts/raw/19-devtools-widgets-calling.avif'
import contextFlowShot from '../../artifacts/raw/20-devtools-context-flow.avif'
import relativeMouseShot from '../../artifacts/raw/21-devtools-relative-mouse.avif'
import beatSyncShot from '../../artifacts/raw/22-devtools-beat-sync.avif'
import websocketInspectorShot from '../../artifacts/raw/23-devtools-websocket-inspector.avif'
import pluginHostShot from '../../artifacts/raw/24-devtools-plugin-host.avif'
import screenCaptureShot from '../../artifacts/raw/25-devtools-screen-capture.avif'
import visionCaptureShot from '../../artifacts/raw/26-devtools-vision-capture.avif'
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

const mainOnlyWindowStyle = {
  right: '0px',
  bottom: '0px',
}

const settingsOnlyWindowStyle = {
  left: '50%',
  top: '84px',
  transform: 'translateX(-50%)',
}

const chatWindowStyle = {
  left: '50%',
  top: '72px',
  transform: 'translateX(-50%)',
}

const settingsCaptureRoots = [
  { name: 'manual-settings-window', src: settingsShot, imageClass: 'w-130' },
  { name: 'manual-websocket-settings', src: websocketSettingsShot, imageClass: 'w-130' },
  { name: 'manual-airi-card', src: airiCardShot, imageClass: 'w-140' },
  { name: 'manual-providers', src: providersShot, imageClass: 'w-140' },
  { name: 'manual-data-settings', src: dataShot, imageClass: 'w-140' },
  { name: 'manual-system-general', src: systemGeneralShot, imageClass: 'w-140' },
  { name: 'manual-system-color-scheme', src: systemColorSchemeShot, imageClass: 'w-140' },
  { name: 'manual-models', src: modelsShot, imageClass: 'w-150' },
  { name: 'manual-modules', src: modulesShot, imageClass: 'w-140' },
  { name: 'manual-hearing', src: hearingShot, imageClass: 'w-145' },
  { name: 'manual-system-developer', src: systemDeveloperShot, imageClass: 'w-145' },
  { name: 'manual-consciousness', src: consciousnessShot, imageClass: 'w-145' },
  { name: 'manual-speech', src: speechShot, imageClass: 'w-150' },
  { name: 'manual-vision', src: visionShot, imageClass: 'w-145' },
  { name: 'manual-devtools-use-window-mouse', src: useWindowMouseShot, imageClass: 'w-140' },
  { name: 'manual-devtools-displays', src: displaysShot, imageClass: 'w-150' },
  { name: 'manual-devtools-widgets-calling', src: widgetsCallingShot, imageClass: 'w-150' },
  { name: 'manual-devtools-context-flow', src: contextFlowShot, imageClass: 'w-155' },
  { name: 'manual-devtools-relative-mouse', src: relativeMouseShot, imageClass: 'w-150' },
  { name: 'manual-devtools-beat-sync', src: beatSyncShot, imageClass: 'w-155' },
  { name: 'manual-devtools-websocket-inspector', src: websocketInspectorShot, imageClass: 'w-155' },
  { name: 'manual-devtools-plugin-host', src: pluginHostShot, imageClass: 'w-155' },
  { name: 'manual-devtools-screen-capture', src: screenCaptureShot, imageClass: 'w-155' },
  { name: 'manual-devtools-vision-capture', src: visionCaptureShot, imageClass: 'w-155' },
] as const

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
      waitForImageSource(controlsIslandShot),
      waitForImageSource(settingsShot),
      waitForImageSource(websocketSettingsShot),
      waitForImageSource(chatWindowShot),
      waitForImageSource(airiCardShot),
      waitForImageSource(providersShot),
      waitForImageSource(dataShot),
      waitForImageSource(systemGeneralShot),
      waitForImageSource(systemColorSchemeShot),
      waitForImageSource(modelsShot),
      waitForImageSource(modulesShot),
      waitForImageSource(hearingShot),
      waitForImageSource(systemDeveloperShot),
      waitForImageSource(consciousnessShot),
      waitForImageSource(speechShot),
      waitForImageSource(visionShot),
      waitForImageSource(useWindowMouseShot),
      waitForImageSource(displaysShot),
      waitForImageSource(widgetsCallingShot),
      waitForImageSource(contextFlowShot),
      waitForImageSource(relativeMouseShot),
      waitForImageSource(beatSyncShot),
      waitForImageSource(websocketInspectorShot),
      waitForImageSource(pluginHostShot),
      waitForImageSource(screenCaptureShot),
      waitForImageSource(visionCaptureShot),
    ])
    markScenarioReady()
  }
  catch (error) {
    console.error(error)
  }
})
</script>

<template>
  <ScenarioCaptureRoot name="manual-main-window">
    <ScenarioCanvas :width="1920" :height="1080">
      <PlatformRoot :dock-size="1.5">
        <template #windows>
          <WindowRoot
            :style="mainOnlyWindowStyle"
            anchor-to="bottom-right"
            anchor-bounds="workarea"
            :frame="false"
            :has-shadow="false"
          >
            <img :src="stageShot" class="w-95">
          </WindowRoot>
        </template>
        <template #dock>
          <Application running>
            <Icon />
          </Application>
        </template>
      </PlatformRoot>
    </ScenarioCanvas>
  </ScenarioCaptureRoot>

  <ScenarioCaptureRoot name="manual-controls-island-expanded">
    <ScenarioCanvas :width="1920" :height="1080">
      <PlatformRoot :dock-size="1.5">
        <template #windows>
          <WindowRoot
            :style="mainOnlyWindowStyle"
            anchor-to="bottom-right"
            anchor-bounds="workarea"
            :frame="false"
            :has-shadow="false"
          >
            <img :src="controlsIslandShot" class="w-95">
          </WindowRoot>
        </template>
        <template #dock>
          <Application running>
            <Icon />
          </Application>
        </template>
      </PlatformRoot>
    </ScenarioCanvas>
  </ScenarioCaptureRoot>

  <ScenarioCaptureRoot
    v-for="capture in settingsCaptureRoots"
    :key="capture.name"
    :name="capture.name"
  >
    <ScenarioCanvas :width="1920" :height="1080">
      <PlatformRoot :dock-size="1.5">
        <template #windows>
          <WindowRoot :style="settingsOnlyWindowStyle">
            <img :src="capture.src" :class="capture.imageClass">
          </WindowRoot>
        </template>
        <template #dock>
          <Application running>
            <Icon />
          </Application>
        </template>
      </PlatformRoot>
    </ScenarioCanvas>
  </ScenarioCaptureRoot>

  <ScenarioCaptureRoot name="manual-chat-window">
    <ScenarioCanvas :width="1920" :height="1080">
      <PlatformRoot :dock-size="1.5">
        <template #windows>
          <WindowRoot :style="chatWindowStyle">
            <img :src="chatWindowShot" class="w-150">
          </WindowRoot>
        </template>
        <template #dock>
          <Application running>
            <Icon />
          </Application>
        </template>
      </PlatformRoot>
    </ScenarioCanvas>
  </ScenarioCaptureRoot>

  <ScenarioCaptureRoot name="intro-chat-window">
    <ScenarioCanvas :width="1920" :height="1080">
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
    </ScenarioCanvas>
  </ScenarioCaptureRoot>
</template>
