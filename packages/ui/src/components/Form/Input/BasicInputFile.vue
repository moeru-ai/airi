<script setup lang="ts">
import { useDebounce } from '@vueuse/core'
import { ref } from 'vue'

defineProps<{
  accept?: string
  multiple?: boolean
}>()

const files = defineModel<File[]>({ required: false, default: () => [] })
const firstFile = ref<File>()

const isDragging = ref(false)
const isDraggingDebounced = useDebounce(isDragging, 150)

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement

  if (input.files && input.files.length > 0) {
    firstFile.value = input.files[0]
  }

  files.value = Array.from(input.files || [])
  isDragging.value = false
}
</script>

<template>
  <label
    relative cursor-pointer
    @dragover="isDragging = true"
    @dragleave="isDragging = false"
  >
    <input
      type="file"
      :accept="accept"
      :multiple="multiple"
      class="absolute inset-0 h-full w-full opacity-0"
      @change="handleFileChange"
    >
    <slot :is-dragging="isDraggingDebounced" :first-file="firstFile" :files="files" />
  </label>
</template>
