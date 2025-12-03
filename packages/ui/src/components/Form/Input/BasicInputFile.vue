<script setup lang="ts">
import { useDebounce } from '@vueuse/core'
import { ref } from 'vue'

const props = defineProps<{
  class?: string | string[] | null
  isDraggingClasses?: string | string[] | null
  isNotDraggingClasses?: string | string[] | null
  accept?: string
  multiple?: boolean
  modelValue?: File[]
}>()

const emit = defineEmits<{
  'update:modelValue': [files: File[]]
}>()

const files = ref<File[]>([])
const firstFile = ref<File>()

const isDragging = ref(false)
const isDraggingDebounced = useDebounce(isDragging, 150)

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files)
    return

  files.value = []

  for (let i = 0; i < input.files.length; i++) {
    files.value.push(input.files[i])
  }

  emit('update:modelValue', files.value)

  if (files.value.length > 0) {
    firstFile.value = files.value[0]
  }

  isDragging.value = false

  // Allow re-selecting the same file
  input.value = ''
}
</script>

<template>
  <label
    :class="[
      'relative',
      'cursor-pointer',
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
