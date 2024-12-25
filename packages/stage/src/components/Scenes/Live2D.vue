<script setup lang="ts">
import { ref } from 'vue'
import {
  EmotionAngryMotionName,
  EmotionAwkwardMotionName,
  EmotionHappyMotionName,
  EmotionQuestionMotionName,
  EmotionSadMotionName,
  EmotionSurpriseMotionName,
  EmotionThinkMotionName,
} from '../../constants/emotions'

import Live2DViewer from '../Live2D/Viewer.vue'
import Screen from '../Screen.vue'

withDefaults(defineProps<{
  model: string
  mouthOpenSize?: number
}>(), {
  mouthOpenSize: 0,
})

const modelRef = ref<{
  setMotion: (motionName: string) => Promise<void>
}>()
const show = ref(false)

defineExpose({
  setMotion: async (motionName: string): Promise<void> => {
    await modelRef.value?.setMotion(motionName)
  },
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <Live2DViewer ref="modelRef" :canvas-width="width" :canvas-height="height" :model="model" :mouth-open-size="mouthOpenSize" />
    <div absolute top="2">
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
          rounded-md px-2 py-2 z="<md:1000"
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
        <div v-if="show" absolute w-full top="10" min-w="50vw" z="<md:1000">
          <div bg="zinc-200/20 dark:black/20" rounded-lg p-2 backdrop-blur-sm>
            <div font-mono>
              <span>Emotions</span>
            </div>
            <div flex="~ row" flex-wrap gap-2>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setMotion(EmotionSurpriseMotionName)"
              >
                🤯 Surprised
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setMotion(EmotionSadMotionName)"
              >
                😫 Sad
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setMotion(EmotionAngryMotionName)"
              >
                😠 Angry
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setMotion(EmotionHappyMotionName)"
              >
                😄 Happy
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setMotion(EmotionAwkwardMotionName)"
              >
                😳 Awkward
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setMotion(EmotionQuestionMotionName)"
              >
                🤔 Question
              </button>
              <button
                rounded-lg bg="zinc-100/70 dark:zinc-800/50" px-2 py-1 backdrop-blur-sm
                @click="modelRef?.setMotion(EmotionThinkMotionName)"
              >
                🤨 Think
              </button>
            </div>
          </div>
        </div>
      </TransitionVertical>
    </div>
  </Screen>
</template>
