<script setup lang="ts">
import { ScenarioCanvas, ScreenMarupsProvider, ScreenRouterCaptureRoot } from '@proj-airi/vishot-runtime/vue'

import Icon from '../../../../components/icon.vue'

import { PlatformRoot } from '../../../../components/platforms/macos-26'
import { Application } from '../../../../components/platforms/macos-26/containers/dock'

interface SceneCaptureLayoutProps {
  height?: number
  name: string
  platformUiScale?: number
  scaleMultiplier?: number
  width?: number
}

withDefaults(defineProps<SceneCaptureLayoutProps>(), {
  height: 1080,
  platformUiScale: 1,
  scaleMultiplier: 1,
  width: 1920,
})
</script>

<template>
  <ScreenRouterCaptureRoot :name="name">
    <ScenarioCanvas :width="width" :height="height" :scale-multiplier="scaleMultiplier">
      <ScreenMarupsProvider :width="width" :height="height">
        <PlatformRoot :dock-size="1.5" :ui-scale="platformUiScale">
          <template #windows>
            <slot name="windows" />
          </template>
          <template #dock>
            <Application running>
              <Icon />
            </Application>
          </template>
        </PlatformRoot>

        <template #overlay>
          <slot name="overlay" />
        </template>
      </ScreenMarupsProvider>
    </ScenarioCanvas>
  </ScreenRouterCaptureRoot>
</template>
