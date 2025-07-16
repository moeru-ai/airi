<script setup lang="ts">
import { useLive2d } from '@proj-airi/stage-ui/stores'

defineEmits<{
  (e: 'click'): void
}>()

const live2d = useLive2d()
</script>

<template>
  <button
    :disabled="live2d.loadingModel"
    bg="neutral-100 dark:neutral-800"
    hover="bg-neutral-200 dark:bg-neutral-700"
    transition="all ease-in-out duration-250"
    rounded
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>
