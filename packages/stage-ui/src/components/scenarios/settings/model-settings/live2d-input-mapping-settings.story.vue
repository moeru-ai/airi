<script setup lang="ts">
import type { Live2DInputMapping, Live2DInputMappingMode } from '@proj-airi/stage-ui-live2d'

import { ref } from 'vue'

import Live2DInputMappingSettings from './live2d-input-mapping-settings.vue'

const emptyMapping: Live2DInputMapping = {
  status: 'missing',
  bindings: [],
  physicsOutputs: [],
  issues: [],
}
const readyMapping: Live2DInputMapping = {
  status: 'ready',
  bindings: [{
    source: 'ParamAngleX',
    target: 'ParamBodyAngleXInput',
    sourceScale: 1,
    sourceOffset: 0,
    inputMin: -30,
    inputMax: 30,
    outputMin: -10,
    outputMax: 10,
    clampInput: true,
    clampOutput: true,
    smoothing: 0,
  }],
  physicsOutputs: ['ParamBodyAngleX'],
  source: 'avatar.vtube.json',
  issues: [],
}
const variants = ref<Array<{
  id: string
  title: string
  mapping: Live2DInputMapping
  loading?: boolean
  mode: Live2DInputMappingMode
}>>([
  { id: 'loading', title: 'Loading', mapping: emptyMapping, loading: true, mode: 'default' },
  { id: 'missing', title: 'No mapping', mapping: emptyMapping, mode: 'default' },
  { id: 'invalid', title: 'Invalid mapping', mapping: { ...emptyMapping, status: 'invalid', issues: ['invalid-binding'] }, mode: 'default' },
  { id: 'unsupported', title: 'Unsupported inputs', mapping: { ...emptyMapping, status: 'unsupported', issues: ['unsupported-input'] }, mode: 'default' },
  { id: 'ready', title: 'Ready', mapping: readyMapping, mode: 'default' },
  { id: 'model', title: 'VTube Studio input mapping', mapping: readyMapping, mode: 'model' },
  { id: 'partial', title: 'Partial support', mapping: { ...readyMapping, issues: ['unsupported-options'] }, mode: 'model' },
])
</script>

<template>
  <Story title="Live2D / Model input mapping" group="form" :layout="{ type: 'single' }">
    <Variant v-for="variant in variants" :id="variant.id" :key="variant.id" :title="variant.title">
      <div :class="['max-w-140 rounded-xl bg-white p-5 dark:bg-neutral-900']">
        <Live2DInputMappingSettings v-model="variant.mode" :mapping="variant.mapping" :loading="variant.loading" />
      </div>
    </Variant>
  </Story>
</template>
