<script setup lang="ts">
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

defineExpose({
  setMotion: async (motionName: string): Promise<void> => {
    await modelRef.value?.setMotion(motionName)
  },
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <Live2DViewer ref="modelRef" :canvas-width="width" :canvas-height="height" :model="model" :mouth-open-size="mouthOpenSize" />
    <div z="10" bottom="2" absolute w-full flex="~ col" gap-2>
      <div flex="~ row" w-full flex-wrap gap-2>
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
  </Screen>
</template>
