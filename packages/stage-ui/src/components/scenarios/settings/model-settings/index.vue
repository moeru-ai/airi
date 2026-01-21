<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'

import { Live2DScene, useLive2d } from '@proj-airi/stage-ui-live2d'
import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { Button, Callout } from '@proj-airi/ui'
import { useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import Live2D from './live2d.vue'
import VRM from './vrm.vue'

import { DisplayModelFormat } from '../../../../stores/display-models'
import { useSettings } from '../../../../stores/settings'
import { ModelSelectorDialog } from '../../dialogs/model-selector'

const props = defineProps<{
  palette: string[]
  settingsClass?: string | string[]

  live2dSceneClass?: string | string[]
  vrmSceneClass?: string | string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const selectedModel = ref<DisplayModel | undefined>()

const positionCursor = useMouse()
const settingsStore = useSettings()
const {
  live2dDisableFocus,
  stageModelSelectedUrl,
  stageModelSelected,
  stageModelRenderer,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
} = storeToRefs(settingsStore)

watch(selectedModel, async () => {
  stageModelSelected.value = selectedModel.value?.id ?? ''
  await settingsStore.updateStageModel()

  if (selectedModel.value) {
    switch (selectedModel.value.format) {
      case DisplayModelFormat.Live2dZip:
        useLive2d().shouldUpdateView()
        break
      case DisplayModelFormat.VRM:
        useModelStore().shouldUpdateView()
        break
    }
  }
}, { deep: true })
</script>

<template>
  <div
    flex="~ col gap-2" z-10 overflow-y-scroll p-2 :class="[
      ...(props.settingsClass
        ? (typeof props.settingsClass === 'string' ? [props.settingsClass] : props.settingsClass)
        : []),
    ]"
  >
    <Callout label="We support both 2D and 3D models">
      <p>
        Click <strong>Select Model</strong> to import different formats of
        models into catalog, currently, <code>.zip</code> (Live2D) and <code>.vrm</code> (VRM) are supported.
      </p>
      <p>
        Neuro-sama uses 2D model driven by Live2D Inc. developed framework.
        While Grok Ani (first female character announced in Grok Companion)
        uses 3D model that is driven by VRM / MMD open formats.
      </p>
    </Callout>
    <ModelSelectorDialog v-model="selectedModel">
      <Button variant="secondary">
        Select Model
      </Button>
    </ModelSelectorDialog>
    <Live2D
      v-if="stageModelRenderer === 'live2d'"
      :palette="palette"
      @extract-colors-from-model="$emit('extractColorsFromModel')"
    />
    <VRM
      v-if="stageModelRenderer === 'vrm'"
      :palette="palette"
      @extract-colors-from-model="$emit('extractColorsFromModel')"
    />
  </div>
  <!-- Live2D component for 2D stage view -->
  <template v-if="stageModelRenderer === 'live2d'">
    <div :class="[...(props.live2dSceneClass ? (typeof props.live2dSceneClass === 'string' ? [props.live2dSceneClass] : props.live2dSceneClass) : [])]">
      <Live2DScene
        :focus-at="{ x: positionCursor.x.value, y: positionCursor.y.value }"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :disable-focus-at="live2dDisableFocus"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
      />
    </div>
  </template>
  <!-- VRM component for 3D stage view -->
  <template v-if="stageModelRenderer === 'vrm'">
    <div :class="[...(props.vrmSceneClass ? (typeof props.vrmSceneClass === 'string' ? [props.vrmSceneClass] : props.vrmSceneClass) : [])]">
      <ThreeScene :model-src="stageModelSelectedUrl" />
    </div>
  </template>
</template>
