<script setup lang="ts">
import { TransitionVertical } from '@proj-airi/ui'
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import DataGuiRange from '../DataGui/Range.vue'
import Collapsable from '../Misc/Collapsable.vue'
import Screen from '../Misc/Screen.vue'
import VRMModel from './VRM/Model.vue'

const props = defineProps<{
  model: string
  idleAnimation: string
  paused: boolean
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

const { t } = useI18n()

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
        :paused="props.paused"
        @load-model-progress="(val) => emit('loadModelProgress', val)"
        @error="(val) => emit('error', val)"
      />
    </TresCanvas>
    <div absolute bottom="3" right="3">
      <div flex="~ row" cursor-pointer>
        <label
          :class="[show ? 'bg-neutral-300 dark:bg-neutral-200' : 'bg-neutral-100 dark:bg-neutral-700']"
          transition="all ease-in-out duration-500"
          text="lg neutral-500 dark:neutral-400"
          m-1 h-fit w-fit cursor-pointer appearance-none gap-1 rounded-lg rounded-md border-none p-2 outline-none
        >
          <input
            v-model="show"
            :checked="show"
            :aria-checked="show"
            name="showLive2DViewerInspector"
            type="checkbox"
            appearance-none outline-none hidden
          >
          <div select-none>
            <div i-solar:bug-bold-duotone />
          </div>
        </label>
      </div>
      <TransitionVertical>
        <div v-if="show" min-w="50vw" z="<md:20" class="bottom-11 right-0" absolute m-1 w-full>
          <div bg="neutral-200/20 dark:black/20" flex="~ col" gap-2 rounded-lg p-2 backdrop-blur-sm>
            <div font-mono>
              <span>{{ t('stage.viewers.debug-menu.vrm.model.title') }}</span>
            </div>
            <Collapsable h-fit w-full flex="~ col" border="~ gray/25 rounded-lg" divide="y dashed gray/25" of-clip shadow-sm>
              <template #label>
                <span font-mono>{{ t('stage.viewers.debug-menu.vrm.camera') }}</span>
              </template>
              <div grid="~ cols-[20px_1fr_60px]" w-full gap-1 p-2 text-sm font-mono>
                <div text="neutral-400 dark:neutral-500">
                  <span>X</span>
                </div>
                <label w-full flex items-center gap-2>
                  <DataGuiRange v-model="cameraPositionX" :min="-10" :max="10" :step="0.01" />
                </label>
                <div text-right>
                  <span>{{ cameraPositionX }}</span>
                </div>

                <div text="neutral-400 dark:neutral-500">
                  <span>Y</span>
                </div>
                <label w-full flex items-center gap-2>
                  <DataGuiRange v-model="cameraPositionY" :min="-10" :max="10" :step="0.01" />
                </label>
                <div text-right>
                  <span>{{ cameraPositionY }}</span>
                </div>

                <div text="neutral-400 dark:neutral-500">
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
            <Collapsable h-fit w-full flex="~ col" border="~ gray/25 rounded-lg" divide="y dashed gray/25" of-clip shadow-sm>
              <template #label>
                <span font-mono>{{ t('stage.viewers.debug-menu.vrm.model.title') }}</span>
              </template>
              <div grid="~ cols-[20px_1fr_60px]" w-full gap-1 p-2 text-sm font-mono>
                <div text="neutral-400 dark:neutral-500">
                  <span>X</span>
                </div>

                <label w-full flex items-center gap-2>
                  <DataGuiRange v-model="vrmModelPositionX" :min="-10" :max="10" :step="0.01" />
                </label>
                <div text-right>
                  <span>{{ vrmModelPositionX }}</span>
                </div>

                <div text="neutral-400 dark:neutral-500">
                  <span>Y</span>
                </div>
                <label w-full flex items-center gap-2>
                  <DataGuiRange v-model="vrmModelPositionY" :min="-10" :max="10" :step="0.01" />
                </label>
                <div text-right>
                  <span>{{ vrmModelPositionY }}</span>
                </div>

                <div text="neutral-400 dark:neutral-500">
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
              <span>{{ t('stage.viewers.debug-menu.emotions') }}</span>
            </div>
            <div flex="~ row" w-full flex-wrap gap-2>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('neutral')"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.neutral') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('surprised')"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.surprised') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('sad')"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.sad') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('angry')"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.angry') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setExpression('happy')"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.happy') }}
              </button>
            </div>
          </div>
        </div>
      </TransitionVertical>
    </div>
  </Screen>
</template>
