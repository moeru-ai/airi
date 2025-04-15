<script setup lang="ts">
import { useRouter } from 'vue-router'

defineProps<{
  title: string
  subtitle?: string
}>()

const router = useRouter()
</script>

<template>
  <div
    v-motion
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :duration="250"
    :style="{
      top: 'env(safe-area-inset-top, 0px)',
      right: 'env(safe-area-inset-right, 0px)',
      left: 'env(safe-area-inset-left, 0px)',
    }"
    sticky inset-x-0 top-0 z-99 mb-4 w-full py-10
    flex="~ row items-center gap-2"
    bg="$bg-color"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div v-if="subtitle" absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500" text-nowrap>{{ subtitle }}</span>
      </div>
      <div text-nowrap text-3xl font-semibold>
        {{ title }}
      </div>
    </h1>
  </div>
</template>
