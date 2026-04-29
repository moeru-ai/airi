<script setup lang="ts">
import { useObjectUrl } from '@vueuse/core'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  accept?: string
  multiple?: boolean
  placeholder?: string
}>(), {
  placeholder: 'Choose file',
  multiple: false,
})

const modelValue = defineModel<File[] | undefined>({ default: undefined })

const fileNames = computed(() => {
  const files = modelValue.value ?? []
  if (!files.length)
    return props.placeholder
  return files.map(file => file.name).join(', ')
})

const previewImageFile = computed(() => {
  const files = modelValue.value ?? []
  return files.find(file => file.type.startsWith('image/'))
})

const previewUrl = useObjectUrl(previewImageFile)

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) {
    modelValue.value = undefined
    return
  }

  const files = Array.from(input.files)
  modelValue.value = files.length ? files : undefined

  // Allow re-selecting the same file.
  input.value = ''
}
</script>

<template>
  <label
    :class="[
      'w-full flex cursor-pointer items-center gap-2',
      'rounded-lg border-2 border-solid border-neutral-100 bg-neutral-50 px-2 py-1 shadow-sm',
      'transition-all duration-200 ease-in-out',
      'dark:border-neutral-900 dark:bg-neutral-950',
      'hover:border-primary-300/70 dark:hover:border-primary-700/70',
    ]"
  >
    <input
      type="file"
      :accept="accept"
      :multiple="multiple"
      :class="[
        'hidden',
      ]"
      @change="onFileChange"
    >

    <div
      :class="[
        'i-solar:upload-square-line-duotone h-5 w-5 shrink-0 text-neutral-500 dark:text-neutral-400',
      ]"
    />

    <div
      :class="[
        'min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-300',
      ]"
      :title="fileNames"
    >
      {{ fileNames }}
    </div>

    <div
      v-if="previewUrl"
      :class="[
        'h-8 w-8 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-white',
        'dark:border-neutral-700 dark:bg-neutral-900',
      ]"
    >
      <img
        :src="previewUrl"
        alt="Preview"
        :class="[
          'h-full w-full object-cover',
        ]"
      >
    </div>
  </label>
</template>
