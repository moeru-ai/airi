<script setup lang="ts">
import { ref } from 'vue'

const step = ref<string>('')
const progress = ref<number>(0)
const done = ref<boolean>(false)

function handleUpdateStep(value: string) {
  step.value = value
}

function handleUpdateProgress(value: number) {
  progress.value = value
}

function handleUpdateDone(value: boolean) {
  done.value = value
}

defineExpose({
  handleUpdateStep,
  handleUpdateProgress,
  handleUpdateDone,
})
</script>

<template>
  <Transition name="fade-out">
    <div
      v-if="!done"
      w="[100dvw]" h="[100dvh]"
      absolute inset-0 z-99 flex items-center justify-center
      bg="neutral-50 dark:neutral-950"
    >
      <div min-w="100" flex flex-col gap-2>
        <div
          h-2 rounded-full bg="neutral-400 dark:neutral-600"
          transition="all duration-300 ease-in-out"
          :style="{ width: `${progress}%` }"
        />
        <div text="neutral-400 dark:neutral-600">
          {{ step }}
        </div>
      </div>
    </div>
  </Transition>
  <slot :step="step" :progress="progress" />
</template>

<style scoped>
.fade-out-enter-active,
.fade-out-leave-active {
  transition: opacity 0.3s ease-in-out;
}

.fade-out-enter-from,
.fade-out-leave-to {
  opacity: 0;
}

.fade-out-enter-to,
.fade-out-leave-from {
  opacity: 1;
}
</style>
