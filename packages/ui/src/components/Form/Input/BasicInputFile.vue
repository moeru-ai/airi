<script setup lang="ts">
import { useDebounce } from '@vueuse/core'
import { ref } from 'vue'

const props = defineProps<{
  class?: string | string[] | null
  isDraggingClasses?: string | string[] | null
  isNotDraggingClasses?: string | string[] | null
  accept?: string
  multiple?: boolean
}>()

const files = defineModel<File[]>({ required: false, default: () => [] })
const firstFile = ref<File>()

const isDragging = ref(false)
const isDraggingDebounced = useDebounce(isDragging, 150)

function handleFileChange(e: Event) {
  files.value = []

  const input = e.target as HTMLInputElement
  if (!input.files)
    return

  for (let i = 0; i < input.files?.length; i++) {
    files.value.push(input.files[i])
  }

  if (files.value && files.value.length > 0) {
    firstFile.value = files.value[0]
  }

  isDragging.value = false
}
</script>

<template>
  <label
    relative cursor-pointer
    :class="[
      props.class,
      isDragging
        ? [...Array.isArray(isDraggingClasses) ? isDraggingClasses : [isDraggingClasses]]
        : [...Array.isArray(isNotDraggingClasses) ? isNotDraggingClasses : [isNotDraggingClasses]],
    ]"
    @dragover="isDragging = true"
    @dragleave="isDragging = false"
  >
    <input
      type="file"
      :accept="accept"
      :multiple="multiple"
      class="absolute inset-0 h-0 w-0 cursor-pointer appearance-none opacity-0"
      @change="handleFileChange"
    >
    <slot :is-dragging="isDraggingDebounced" :first-file="firstFile" :files="files" />
  </label>
</template>
