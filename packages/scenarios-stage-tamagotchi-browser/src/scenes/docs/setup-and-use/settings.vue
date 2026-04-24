<script setup lang="ts">
import { useSceneReady } from '@proj-airi/vishot-runtime/vue'

import settingsShot from '../../../../artifacts/raw/02-settings-window.avif'
import websocketSettingsShot from '../../../../artifacts/raw/03-websocket-settings.avif'
import airiCardShot from '../../../../artifacts/raw/05-airi-card.avif'
import providersShot from '../../../../artifacts/raw/06-providers.avif'
import dataShot from '../../../../artifacts/raw/07-data.avif'
import systemGeneralShot from '../../../../artifacts/raw/08-system-general.avif'
import systemColorSchemeShot from '../../../../artifacts/raw/09-system-color-scheme.avif'
import modelsShot from '../../../../artifacts/raw/10-models.avif'
import modulesShot from '../../../../artifacts/raw/11-modules.avif'
import hearingShot from '../../../../artifacts/raw/12-hearing.avif'
import systemDeveloperShot from '../../../../artifacts/raw/13-system-developer.avif'
import consciousnessShot from '../../../../artifacts/raw/14-consciousness.avif'
import speechShot from '../../../../artifacts/raw/15-speech.avif'
import visionShot from '../../../../artifacts/raw/16-vision.avif'
import useWindowMouseShot from '../../../../artifacts/raw/17-devtools-use-window-mouse.avif'
import displaysShot from '../../../../artifacts/raw/18-devtools-displays.avif'
import widgetsCallingShot from '../../../../artifacts/raw/19-devtools-widgets-calling.avif'
import contextFlowShot from '../../../../artifacts/raw/20-devtools-context-flow.avif'
import relativeMouseShot from '../../../../artifacts/raw/21-devtools-relative-mouse.avif'
import beatSyncShot from '../../../../artifacts/raw/22-devtools-beat-sync.avif'
import websocketInspectorShot from '../../../../artifacts/raw/23-devtools-websocket-inspector.avif'
import pluginHostShot from '../../../../artifacts/raw/24-devtools-plugin-host.avif'
import screenCaptureShot from '../../../../artifacts/raw/25-devtools-screen-capture.avif'
import visionCaptureShot from '../../../../artifacts/raw/26-devtools-vision-capture.avif'
import SceneCaptureLayout from './components/scene-capture-layout.vue'

import { WindowRoot } from '../../../components/platforms/macos-26/containers/window'

useSceneReady([
  settingsShot,
  websocketSettingsShot,
  airiCardShot,
  providersShot,
  dataShot,
  systemGeneralShot,
  systemColorSchemeShot,
  modelsShot,
  modulesShot,
  hearingShot,
  systemDeveloperShot,
  consciousnessShot,
  speechShot,
  visionShot,
  useWindowMouseShot,
  displaysShot,
  widgetsCallingShot,
  contextFlowShot,
  relativeMouseShot,
  beatSyncShot,
  websocketInspectorShot,
  pluginHostShot,
  screenCaptureShot,
  visionCaptureShot,
])
</script>

<route lang="yaml">
meta:
  title: Setup And Use Settings
</route>

<template>
  <SceneCaptureLayout name="manual-settings-window" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="settingsShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-websocket-settings" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="websocketSettingsShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-airi-card" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="airiCardShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-providers" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="providersShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-data-settings" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="dataShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-system-general" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="systemGeneralShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-system-color-scheme" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="systemColorSchemeShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-models" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="modelsShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-modules" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="modulesShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-hearing" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="hearingShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-system-developer" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="systemDeveloperShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-consciousness" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="consciousnessShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-speech" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="speechShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-vision" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="visionShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-use-window-mouse" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="useWindowMouseShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-displays" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="displaysShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-widgets-calling" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="widgetsCallingShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-context-flow" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="contextFlowShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-relative-mouse" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="relativeMouseShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-beat-sync" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="beatSyncShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-websocket-inspector" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="websocketInspectorShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-plugin-host" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="pluginHostShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-screen-capture" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="screenCaptureShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>

  <SceneCaptureLayout name="manual-devtools-vision-capture" :platform-ui-scale="1.25">
    <template #windows>
      <WindowRoot :style="{ left: '50%', top: '84px', transform: 'translateX(-50%)' }">
        <img :src="visionCaptureShot" :class="['w-120']">
      </WindowRoot>
    </template>
  </SceneCaptureLayout>
</template>
