<script setup lang="ts">
import { useObjectUrl } from '@vueuse/core'

const props = defineProps<{
  file: File
}>()

const emit = defineEmits<{
  remove: []
}>()

const previewUrl = useObjectUrl(() => props.file)
</script>

<template>
  <div :class="['relative shrink-0']">
    <img
      v-if="previewUrl"
      :src="previewUrl"
      :class="['h-20 w-20 rounded-md object-cover']"
    >
    <button
      :class="[
        'absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full',
        'bg-red-500 text-xs text-white',
      ]"
      @click="emit('remove')"
    >
      &times;
    </button>
  </div>
</template>
