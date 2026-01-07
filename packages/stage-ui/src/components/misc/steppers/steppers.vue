<script setup lang="ts" generic="T extends Record<string, any> | any">
import { computed, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  steps: T[]
  stepKey?: keyof T | string
}>(), {
  stepKey: 'id',
})

const emit = defineEmits<{
  (e: 'finish'): void
}>()

const value = defineModel<number>({ required: false, default: 0 })

const slots = useSlots()

const isFirstStep = computed(() => value.value === 0)
const isLastStep = computed(() => value.value === props.steps.length - 1)

function getKey(step: T, index: number): string | number {
  if (typeof step === 'object' && step !== null && props.stepKey in step) {
    return (step as any)[props.stepKey]
  }
  return index // Fallback to index
}

function back() {
  if (!isFirstStep.value) {
    value.value--
  }
}

function next() {
  if (isLastStep.value) {
    emit('finish')
  }
  else {
    value.value++
  }
}

function goToStep(index: number) {
  value.value = index
}
</script>

<template>
  <div class="w-full font-sans">
    <div
      class="flex flex-col gap-1 overflow-hidden rounded-xl px-4 py-3"
      bg="white/70 dark:neutral-900/70"
      border="neutral-100 dark:neutral-800/25 hover:primary-500/30 dark:hover:primary-400/30 solid 2"
      drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
      transition="all ease-in-out duration-400"
    >
      <!-- Header Slot -->
      <div v-if="slots.header">
        <slot name="header" />
      </div>
      <div v-else>
        <p class="text-xs text-neutral-500/50 dark:text-neutral-400">
          Step {{ value + 1 }} of {{ steps.length }}
        </p>
      </div>

      <!-- Current Step Content -->
      <!-- Need relative parent for absolute positioning of steps -->
      <template v-for="(step, index) in steps" :key="getKey(step, index)">
        <div
          v-if="index === value"
          v-motion
          :initial="{ opacity: 0, filter: 'blur(1px)', x: 10, transition: { type: 'keyframes', duration: 500, ease: 'easeInOut' } }"
          :enter="{ opacity: 1, filter: 'blur(0px)', x: 0, transition: { type: 'keyframes', duration: 500, ease: 'easeInOut' } }"
          :leave="{ opacity: 0, filter: 'blur(1px)', x: -10, transition: { type: 'keyframes', duration: 500, ease: 'easeInOut' } }"
        >
          <slot name="step" :step="step" :index="index" :is-active="index === value">
            <!-- Default step rendering -->
            <div class="flex flex-col gap-1">
              <p v-if="typeof step === 'object' && step !== null && 'title' in step" class="mb-4 pb-0 pt-0 text-xl text-primary-600 font-normal dark:text-primary-300">
                {{ step.title }}
              </p>
              <p v-if="typeof step === 'object' && step !== null && 'description' in step" class="text-sm text-neutral-600 dark:text-neutral-300">
                {{ step.description }}
              </p>
              <!-- Fallback if step is not an object with title/description -->
              <p v-else class="text-sm text-neutral-600 dark:text-neutral-300">
                {{ step }}
              </p>
            </div>
          </slot>
        </div>
      </template>

      <!-- Navigation Footer -->
      <div class="flex items-center justify-between">
        <!-- Progress Dots -->
        <div class="flex flex-wrap items-center gap-1.5">
          <template v-for="(step, index) in steps" :key="`dot-${getKey(step, index)}`">
            <slot
              name="step-dot"
              :step="step"
              :index="index"
              :is-active="index === value"
              :go-to-step="() => goToStep(index)"
            >
              <!-- Default dot rendering -->
              <div
                class="size-2 cursor-pointer rounded-full transition-all duration-200"
                :class="[
                  index === value ? 'bg-primary-500 scale-125' : 'bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400',
                  index < value ? 'bg-primary-300 dark:bg-primary-700 opacity-70' : '',
                ]"
                :title="`Step ${index + 1}${typeof step === 'object' && step !== null && 'title' in step ? `: ${step.title}` : ''}`"
                @click="goToStep(index)"
              />
            </slot>
          </template>
        </div>

        <!-- Back/Next Buttons -->
        <div class="flex gap-2">
          <slot name="back-button" :back="back" :is-disabled="isFirstStep">
            <button
              :disabled="isFirstStep"
              class="rounded bg-neutral-200 px-3 py-1 text-xs text-neutral-700 disabled:cursor-not-allowed dark:bg-neutral-700 hover:bg-neutral-300 dark:text-neutral-200 disabled:opacity-50 dark:hover:bg-neutral-600"
              @click="back"
            >
              Back
            </button>
          </slot>
          <slot name="next-button" :next="next" :is-disabled="false" :is-last="isLastStep">
            <!-- Default next/finish button -->
            <button
              class="rounded bg-primary-500 px-3 py-1 text-xs text-white disabled:cursor-not-allowed hover:bg-primary-600 disabled:opacity-50"
              @click="next"
            >
              {{ isLastStep ? 'Finish' : 'Next' }}
            </button>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>
