<script setup lang="ts">
import { TransitionVertical } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettings } from '../../stores'
import Live2DCanvas from '../Live2D/Canvas.vue'
import Live2DModel from '../Live2D/Model.vue'
import Screen from '../Screen.vue'

import '../../utils/live2d-zip-loader'

withDefaults(defineProps<{
  paused: boolean
  mouthOpenSize?: number
  focusAt: { x: number, y: number }
}>(), {
  mouthOpenSize: 0,
})

const { t } = useI18n()
const show = ref(false)
const { live2dCurrentMotion } = storeToRefs(useSettings())
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <Live2DCanvas
      v-slot="{ app }"
      :width="width"
      :height="height"
      :resolution="2"
      max-h="100dvh"
    >
      <Live2DModel
        :app="app"
        :mouth-open-size="mouthOpenSize"
        :width="width"
        :height="height"
        :paused="paused"
        :focus-at="focusAt"
      />
    </Live2DCanvas>
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
          <div bg="neutral-200/20 dark:black/20" rounded-lg p-2 backdrop-blur-sm>
            <div font-mono>
              <span>{{ t('stage.viewers.debug-menu.emotions') }}</span>
            </div>
            <div flex="~ row" flex-wrap gap-2>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="live2dCurrentMotion = { group: 'Surprise', index: 0 }"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.surprised') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="live2dCurrentMotion = { group: 'Sad', index: 0 }"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.sad') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="live2dCurrentMotion = { group: 'Angry', index: 0 }"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.angry') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="live2dCurrentMotion = { group: 'Happy', index: 0 }"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.happy') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="live2dCurrentMotion = { group: 'Awkward', index: 0 }"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.awkward') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="live2dCurrentMotion = { group: 'Question', index: 0 }"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.question') }}
              </button>
              <button
                rounded-lg bg="neutral-100/70 dark:neutral-800/50" px-2 py-1 backdrop-blur-sm
                @click="live2dCurrentMotion = { group: 'Think', index: 0 }"
              >
                {{ t('stage.viewers.debug-menu.emotions-btn.think') }}
              </button>
            </div>
          </div>
        </div>
      </TransitionVertical>
    </div>
  </Screen>
</template>
