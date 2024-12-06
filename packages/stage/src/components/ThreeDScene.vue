<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'

import Collapsable from './Collapsable.vue'
import DataGuiRange from './DataGui/Range.vue'
import VRMModel from './VRMModel.vue'

const props = defineProps<{
  model: string
  idleAnimation: string
}>()

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()

const cameraPositionX = ref(-0.17)
const cameraPositionY = ref(0)
const cameraPositionZ = ref(-1)
const vrmModelPositionX = ref(-0.18)
const vrmModelPositionY = ref(-1.4)
const vrmModelPositionZ = ref(-0.24)
</script>

<template>
  <Screen v-slot="{ canvasHeight, canvasWidth }" relative>
    <div z="10" top="2" absolute w-full gap-2 px-2 flex="~ col md:row">
      <Collapsable h-fit w-full>
        <template #label>
          <span font-mono>Camera</span>
        </template>
        <div grid="~ cols-[20px_1fr_60px]" w-full gap-2 p-2 text-sm font-mono>
          <div text="zinc-400 dark:zinc-500">
            <span>X</span>
          </div>
          <label w-full flex items-center gap-2>
            <DataGuiRange v-model="cameraPositionX" :min="-10" :max="10" :step="0.01" />
          </label>
          <div text-right>
            <span>{{ cameraPositionX }}</span>
          </div>

          <div text="zinc-400 dark:zinc-500">
            <span>Y</span>
          </div>
          <label w-full flex items-center gap-2>
            <DataGuiRange v-model="cameraPositionY" :min="-10" :max="10" :step="0.01" />
          </label>
          <div text-right>
            <span>{{ cameraPositionY }}</span>
          </div>

          <div text="zinc-400 dark:zinc-500">
            <span>Z</span>
          </div>
          <label w-full flex items-center gap-2>
            <DataGuiRange v-model="cameraPositionZ" :min="-10" :max="10" :step="0.01" />
          </label>
          <div text-right>
            <span>{{ cameraPositionZ }}</span>
          </div>
        </div>
      </Collapsable>
      <Collapsable h-fit w-full>
        <template #label>
          <span font-mono>Model</span>
        </template>
        <div grid="~ cols-[20px_1fr_60px]" w-full gap-2 p-2 text-sm font-mono>
          <div text="zinc-400 dark:zinc-500">
            <span>X</span>
          </div>

          <label w-full flex items-center gap-2>
            <DataGuiRange v-model="vrmModelPositionX" :min="-10" :max="10" :step="0.01" />
          </label>
          <div text-right>
            <span>{{ vrmModelPositionX }}</span>
          </div>

          <div text="zinc-400 dark:zinc-500">
            <span>Y</span>
          </div>
          <label w-full flex items-center gap-2>
            <DataGuiRange v-model="vrmModelPositionY" :min="-10" :max="10" :step="0.01" />
          </label>
          <div text-right>
            <span>{{ vrmModelPositionY }}</span>
          </div>

          <div text="zinc-400 dark:zinc-500">
            <span>Z</span>
          </div>
          <label w-full flex items-center gap-2>
            <DataGuiRange v-model="vrmModelPositionZ" :min="-10" :max="10" :step="0.01" />
          </label>
          <div text-right>
            <span>{{ vrmModelPositionZ }}</span>
          </div>
        </div>
      </Collapsable>
    </div>
    <TresCanvas :alpha="true" :antialias="true" :width="canvasWidth" :height="canvasHeight">
      <TresPerspectiveCamera :position="[cameraPositionX, cameraPositionY, cameraPositionZ]" />
      <TresDirectionalLight :color="0xFFFFFF" :intensity="0.6" :position="[1, 1, 1]" />
      <OrbitControls />
      <VRMModel
        :model="props.model"
        :idle-animation="props.idleAnimation"
        :position="[vrmModelPositionX, vrmModelPositionY, vrmModelPositionZ]"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @error="(val) => emit('error', val)"
      />
      <TresAmbientLight :color="0xFFFFFF" :intensity="0.4" />
    </TresCanvas>
  </Screen>
</template>
