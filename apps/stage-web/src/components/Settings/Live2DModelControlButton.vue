<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'

defineEmits<{
  (e: 'click'): void
}>()

const settings = useSettings()
</script>

<template>
  <button
    :disabled="settings.loadingLive2dModel"
    bg="zinc-100 dark:zinc-800"
    hover="bg-zinc-200 dark:bg-zinc-700"
    transition="all ease-in-out duration-250"
    rounded
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>
