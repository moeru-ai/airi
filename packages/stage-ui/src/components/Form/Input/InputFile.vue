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
    class="min-h-[120px] flex flex-col cursor-pointer items-center justify-center rounded-xl p-6"
    :class="[
      isDraggingDebounced ? 'border-primary-400 dark:border-primary-600 hover:border-primary-300 dark:hover:border-primary-700' : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700',
      isDraggingDebounced ? 'bg-primary-50/5 dark:bg-primary-900/5' : 'bg-white/60 dark:bg-black/30 hover:bg-white/80 dark:hover:bg-black/40',
    ]"
    border="dashed 2"
    transition="all duration-300"
    :style="{ transform: 'scale(0.98)', opacity: 0.95 }"
    hover="scale-100 opacity-100 shadow-md dark:shadow-lg"
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
    <slot :is-dragging="isDraggingDebounced" :first-file="firstFile" :files="files">
      <div
        class="flex flex-col items-center"
        :class="[
          isDraggingDebounced ? 'text-primary-500 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-500',
        ]"
      >
        <div i-solar:upload-square-line-duotone mb-2 text-5xl />
        <p font-medium text="center lg">
          Upload
        </p>
        <p v-if="isDraggingDebounced" text="center" text-sm>
          Release to upload
        </p>
        <p v-else text="center" text-sm>
          Click or drag and drop a file here
        </p>
      </div>
    </slot>
  </label>
</template>
