<script setup lang="ts">
import BasicInputFile from './BasicInputFile.vue'

defineProps<{
  accept?: string
  multiple?: boolean
}>()
</script>

<template>
  <BasicInputFile
    class="min-h-[120px] flex flex-col cursor-pointer items-center justify-center rounded-xl p-6"
    :is-not-dragging-classes="[
      'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700',
      'bg-white/60 dark:bg-black/30 hover:bg-white/80 dark:hover:bg-black/40',
    ]"
    :is-dragging-classes="[
      'border-primary-400 dark:border-primary-600 hover:border-primary-300 dark:hover:border-primary-700',
      'bg-primary-50/5 dark:bg-primary-900/5',
    ]"
    border="dashed 2"
    transition="all duration-300"
    opacity-95
    hover="scale-100 opacity-100 shadow-md dark:shadow-lg"

    :accept="accept"
    :multiple="multiple"
  >
    <template #default="{ isDragging }">
      <div
        class="flex flex-col items-center"
        :class="[
          isDragging ? 'text-primary-500 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-500',
        ]"
      >
        <div i-solar:upload-square-line-duotone mb-2 text-5xl />
        <p font-medium text="center lg">
          Upload
        </p>
        <p v-if="isDragging" text="center" text-sm>
          Release to upload
        </p>
        <p v-else text="center" text-sm>
          Click or drag and drop a file here
        </p>
      </div>
    </template>
  </BasicInputFile>
</template>
