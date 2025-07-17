<script setup lang="ts">
import { storeToRefs } from 'pinia'

import Live2D from './Live2D.vue'
import Live2DScene from './Live2DScene.vue'

import { useSettings } from '../../../../stores/settings'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { stageView } = storeToRefs(useSettings())
</script>

<template>
  <!-- Live2D component for 2D stage view -->
  <template v-if="stageView === '2d'">
    <Live2DScene />
    <div flex="~ col gap-2">
      <Live2D :palette="palette" @extract-colors-from-model="$emit('extractColorsFromModel')" />
    </div>
  </template>
  <!-- TODO: VRM component for 3D stage view -->
</template>
