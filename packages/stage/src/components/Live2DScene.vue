<script setup lang="ts">
import { EmotionAngryMotionName, EmotionAwkwardMotionName, EmotionHappyMotionName, EmotionQuestionMotionName, EmotionSadMotionName, EmotionSurpriseMotionName, EmotionThinkMotionName } from '~/constants/emotions'

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
  <Screen v-slot="{ canvasHeight, canvasWidth }" relative>
    <div z="10" top="2" absolute w-full flex="~ col" gap-2>
      <div flex="~ row" w-full flex-wrap gap-2>
        <button
          rounded-lg bg="zinc-100 dark:zinc-800/50" px-2 py-1
          @click="modelRef?.setMotion(EmotionSurpriseMotionName)"
        >
          🤯 Surprised
        </button>
        <button
          rounded-lg bg="zinc-100 dark:zinc-800/50" px-2 py-1
          @click="modelRef?.setMotion(EmotionSadMotionName)"
        >
          😫 Sad
        </button>
        <button
          rounded-lg bg="zinc-100 dark:zinc-800/50" px-2 py-1
          @click="modelRef?.setMotion(EmotionAngryMotionName)"
        >
          😠 Angry
        </button>
        <button
          rounded-lg bg="zinc-100 dark:zinc-800/50" px-2 py-1
          @click="modelRef?.setMotion(EmotionHappyMotionName)"
        >
          😄 Happy
        </button>
        <button
          rounded-lg bg="zinc-100 dark:zinc-800/50" px-2 py-1
          @click="modelRef?.setMotion(EmotionAwkwardMotionName)"
        >
          😳 Awkward
        </button>
        <button
          rounded-lg bg="zinc-100 dark:zinc-800/50" px-2 py-1
          @click="modelRef?.setMotion(EmotionQuestionMotionName)"
        >
          🤔 Question
        </button>
        <button
          rounded-lg bg="zinc-100 dark:zinc-800/50" px-2 py-1
          @click="modelRef?.setMotion(EmotionThinkMotionName)"
        >
          🤨 Think
        </button>
      </div>
    </div>
    <Live2DViewer ref="modelRef" :canvas-width="canvasWidth" :canvas-height="canvasHeight" :model="model" :mouth-open-size="mouthOpenSize" />
  </Screen>
</template>
