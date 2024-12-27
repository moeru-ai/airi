<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'

import { ref } from 'vue'
import Collapsable from '../Collapsable.vue'
import DataGuiRange from '../DataGui/Range.vue'
import Screen from '../Screen.vue'
import VRMModel from '../VRM/Model.vue'

const props = defineProps<{
  model: string
  idleAnimation: string
}>()

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()

const show = ref(false)

const cameraPositionX = ref(-0.17)
const cameraPositionY = ref(0)
const cameraPositionZ = ref(-1)
const vrmModelPositionX = ref(-0.18)
const vrmModelPositionY = ref(-1.32)
const vrmModelPositionZ = ref(-0.24)

const modelRef = ref<{
  setExpression: (expression: string) => void
}>()

defineExpose({
  setExpression: (expression: string) => {
    modelRef.value?.setExpression(expression)
  },
})
</script>

<template>
  <Screen v-slot="{ height, width }" relative>
    <TresCanvas :alpha="true" :antialias="true" :width="width" :height="height">
      <OrbitControls />
      <TresPerspectiveCamera :position="[cameraPositionX, cameraPositionY, cameraPositionZ]" />
      <TresDirectionalLight :color="0xFFFFFF" :intensity="1.2" :position="[1, 1, 1]" />
      <TresAmbientLight :color="0xFFFFFF" :intensity="1.5" />
      <VRMModel
        ref="modelRef"
        :model="props.model"
        :idle-animation="props.idleAnimation"
        :position="[vrmModelPositionX, vrmModelPositionY, vrmModelPositionZ]"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @error="(val) => emit('error', val)"
      />
    </TresCanvas>
    <div absolute bottom="2" right="2">
      <div
        flex="~ row"
        bg="zinc-100 dark:zinc-700"
        text="sm zinc-400 dark:zinc-500"
        h-fit w-fit appearance-none gap-1 rounded-lg rounded-md border-none
      >
        <label
          h-fit cursor-pointer
          :class="[show ? 'bg-zinc-300 text-zinc-900 dark:bg-zinc-200 dark:text-zinc-800' : '']"
          transition="all ease-in-out duration-500"
          rounded-md px-2 py-2 z="<md:20"
        >
          <input
            v-model="show"
            :checked="show"
            :aria-checked="show"
            name="showLive2DViewerInspector"
            type="checkbox"
            hidden appearance-none outline-none
          >
          <div select-none>
            <div i-solar:bug-bold-duotone text="text-zinc-900 dark:text-zinc-800" />
          </div>
        </label>
      </div>
      <TransitionVertical>
        <div v-if="show" absolute w-full top="10" min-w="50vw" z="<md:20">
          <div bg="zinc-200/20 dark:black/20" flex="~ col" gap-2 rounded-lg p-2 backdrop-blur-sm>
            <div font-mono>
              <span>Model</span>
            </div>
            <Collapsable h-fit w-full>
              <template #label>
                <span font-mono>Camera</span>
              </template>
              <div grid="~ cols-[20px_1fr_60px]" w-full gap-1 p-2 text-sm font-mono>
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
              <div grid="~ cols-[20px_1fr_60px]" w-full gap-1 p-2 text-sm font-mono>
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
            <div font-mono>
              <span>Emotions</span>
            </div>
            <div flex="~ row" w-full flex-wrap gap-2>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('neutral')"
              >
                🙂 Neutral
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('surprised')"
              >
                🤯 Surprised
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('sad')"
              >
                😫 Sad
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('angry')"
              >
                😠 Angry
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('happy')"
              >
                😄 Happy
              </button>
            </div>
          </div>
        </div>
      </TransitionVertical>
    </div>
  </Screen>
</template>
