<script setup lang="ts">
import { storeToRefs } from 'pinia'

import Live2D from './Live2D.vue'
import Live2DScene from './Live2DScene.vue'

import { useSettings } from '../../../../stores/settings'

const props = defineProps<{
  palette: string[]
  live2dSceneClass?: string | string[]
  live2dSettingsClass?: string | string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { stageView } = storeToRefs(useSettings())
</script>

<template>
  <!-- Live2D component for 2D stage view -->
  <template v-if="stageView === '2d'">
    <Live2DScene
      :class="[
        ...(props.live2dSceneClass
          ? (typeof props.live2dSceneClass === 'string' ? [props.live2dSceneClass] : props.live2dSceneClass)
          : []),
      ]"
    />
    <div
      flex="~ col gap-2" :class="[
        ...(props.live2dSettingsClass
          ? (typeof props.live2dSettingsClass === 'string' ? [props.live2dSettingsClass] : props.live2dSettingsClass)
          : []),
      ]"
    >
      <Live2D :palette="palette" @extract-colors-from-model="$emit('extractColorsFromModel')" />
    </div>
  </template>
  <!-- TODO: VRM component for 3D stage view -->
</template>
