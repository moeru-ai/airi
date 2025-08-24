<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'

import { useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import Callout from '../../../Layouts/Callout.vue'
import Button from '../../../Misc/Button.vue'
import Live2DScene from '../../../Scenes/Live2D.vue'
import VRMScene from '../../../Scenes/VRM.vue'
import ModelManagerDialog from '../../Dialogs/model-selector/model-selector-dialog.vue'
import Live2D from './Live2D.vue'
import VRM from './VRM.vue'

import { DisplayModelFormat } from '../../../../stores/display-models'
import { useLive2d } from '../../../../stores/live2d'
import { useSettings } from '../../../../stores/settings'
import { useVRM } from '../../../../stores/vrm'

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
const { live2dDisableFocus, stageModelSelectedUrl, stageModelSelected, stageModelRenderer } = storeToRefs(settingsStore)

watch(selectedModel, async () => {
  stageModelSelected.value = selectedModel.value?.id
  await settingsStore.updateStageModel()

  if (selectedModel.value) {
    switch (selectedModel.value.format) {
      case DisplayModelFormat.Live2dZip:
        useLive2d().shouldUpdateView()
        break
      case DisplayModelFormat.VRM:
        useVRM().shouldUpdateView()
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
    <ModelManagerDialog v-model="selectedModel">
      <Button variant="secondary">
        Select Model
      </Button>
    </ModelManagerDialog>
    <Live2D v-if="stageModelRenderer === 'live2d'" :palette="palette" @extract-colors-from-model="$emit('extractColorsFromModel')" />
    <VRM v-if="stageModelRenderer === 'vrm'" :palette="palette" @extract-colors-from-model="$emit('extractColorsFromModel')" />
  </div>
  <!-- Live2D component for 2D stage view -->
  <template v-if="stageModelRenderer === 'live2d'">
    <div :class="[...(props.live2dSceneClass ? (typeof props.live2dSceneClass === 'string' ? [props.live2dSceneClass] : props.live2dSceneClass) : [])]">
      <Live2DScene
        :focus-at="{ x: positionCursor.x.value, y: positionCursor.y.value }"
        :model-src="stageModelSelectedUrl"
        :disable-focus-at="live2dDisableFocus"
      />
    </div>
  </template>
  <!-- VRM component for 3D stage view -->
  <template v-if="stageModelRenderer === 'vrm'">
    <div :class="[...(props.vrmSceneClass ? (typeof props.vrmSceneClass === 'string' ? [props.vrmSceneClass] : props.vrmSceneClass) : [])]">
      <VRMScene :model-src="stageModelSelectedUrl" />
    </div>
  </template>
</template>
