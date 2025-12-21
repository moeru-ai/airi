<script setup lang="ts">
import type { BackgroundOption } from './types'

import { BasicInputFile } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { computed, nextTick, ref, watch } from 'vue'

import { colorFromElement } from '../../../../libs'

const props = defineProps<{
  options: BackgroundOption[]
  allowUpload?: boolean
}>()

const emit = defineEmits<{
  (e: 'apply', payload: { option: BackgroundOption, color?: string }): void
  (e: 'change', payload: { option: BackgroundOption | undefined }): void
}>()

const modelValue = defineModel<BackgroundOption | undefined>({ default: undefined })

const previewRef = ref<HTMLElement | null>(null)
const uploadingFiles = ref<File[]>([])
const customOptions = ref<BackgroundOption[]>([])
const objectUrls = new Map<string, ReturnType<typeof useObjectUrl>>()
const selectedId = ref<string | undefined>(modelValue.value?.id)
const busy = ref(false)

const mergedOptions = computed(() => [...props.options, ...customOptions.value])
const selectedOption = computed(() => mergedOptions.value.find(option => option.id === selectedId.value))
const enableBlur = ref(false)

watch(modelValue, (value) => {
  selectedId.value = value?.id
})

watch(selectedOption, option => emit('change', { option }))

function getPreviewSrc(option?: BackgroundOption) {
  if (!option)
    return ''

  if (option.file) {
    let urlRef = objectUrls.get(option.id)
    if (!urlRef) {
      const fileRef = ref<Blob | undefined>(option.file)
      urlRef = useObjectUrl(fileRef)
      objectUrls.set(option.id, urlRef)
    }
    return urlRef.value ?? ''
  }

  return option.src ?? ''
}

function handleFilesChange(files: File[]) {
  files.forEach((file) => {
    const option = {
      id: `custom-${nanoid(6)}`,
      label: file.name || 'Custom Background',
      file,
    }
    customOptions.value.push(option)
    selectedId.value = option.id
  })
}

watch(uploadingFiles, (files) => {
  handleFilesChange(files ?? [])
})

async function waitForPreviewReady() {
  await nextTick()
  const image = previewRef.value?.querySelector('img')
  if (image && !image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error('Preview image failed to load')), { once: true })
    })
  }
}

async function applySelection() {
  if (!selectedOption.value || !previewRef.value)
    return

  busy.value = true
  try {
    await waitForPreviewReady()
    const result = await colorFromElement(previewRef.value, {
      mode: 'html2canvas',
      html2canvas: {
        region: {
          x: 0,
          y: 0,
          width: previewRef.value.offsetWidth,
          height: Math.min(120, previewRef.value.offsetHeight),
        },
        sampleHeight: 20,
        sampleStride: 10,
        scale: 0.5,
        backgroundColor: null,
        allowTaint: true,
        useCORS: true,
      },
    })

    emit('apply', { option: { ...selectedOption.value, blur: enableBlur.value }, color: result.html2canvas?.average })
  }
  catch (error) {
    console.error('Background sampling failed:', error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
      <button
        v-for="option in mergedOptions"
        :key="option.id"
        type="button"
        class="border-2 border-transparent rounded-xl bg-neutral-100/80 p-2 text-left transition-colors hover:border-primary-400 dark:bg-neutral-900/80"
        :class="[option.id === selectedId ? 'border-primary-500/80 shadow-primary-500/10 shadow-lg' : 'border-neutral-200 dark:border-neutral-800']"
        @click="selectedId = option.id"
      >
        <div class="aspect-video w-full overflow-hidden border border-neutral-200 rounded-lg bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/70">
          <component
            :is="option.component"
            v-if="option.component"
            class="h-full w-full"
          />
          <img
            v-else-if="getPreviewSrc(option)"
            :src="getPreviewSrc(option)"
            class="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          >
          <div v-else class="h-full w-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
            No preview
          </div>
        </div>
        <div class="mt-2 flex flex-col gap-1">
          <span class="text-base text-neutral-800 font-medium dark:text-neutral-100">{{ option.label }}</span>
          <span v-if="option.description" class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ option.description }}
          </span>
        </div>
      </button>
    </div>

    <div v-if="allowUpload" class="flex flex-wrap gap-2">
      <BasicInputFile v-model="uploadingFiles" class="cursor-pointer">
        <div class="flex items-center gap-2 border border-neutral-300 rounded-lg border-dashed px-3 py-2 text-sm text-neutral-600 transition-colors dark:border-neutral-700 hover:border-primary-400 dark:text-neutral-300 hover:text-primary-500 dark:hover:border-primary-400 dark:hover:text-primary-400">
          <div i-solar:add-square-linear />
          <span>Add custom background</span>
        </div>
      </BasicInputFile>
    </div>

    <div class="border border-neutral-200 rounded-xl bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/70">
      <p class="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
        Preview
      </p>
      <label class="flex items-center gap-2 pb-2 text-sm text-neutral-700 dark:text-neutral-200">
        <input v-model="enableBlur" type="checkbox" class="accent-primary-500" />
        <span>Blur</span>
      </label>
      <div
        ref="previewRef"
        class="relative h-48 overflow-hidden border border-neutral-200 rounded-xl bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
        >
        <component
          :is="selectedOption?.component"
          v-if="selectedOption?.component"
          class="h-full w-full"
        />
        <img
          v-else-if="getPreviewSrc(selectedOption)"
          :src="getPreviewSrc(selectedOption)"
          class="h-full w-full object-cover"
        >
        <div v-else class="h-full w-full flex items-center justify-center text-neutral-500 dark:text-neutral-400">
          Select a background
        </div>
        <div
          class="transparent-gradient-overlay pointer-events-none absolute inset-0 h-[calc((1lh+1rem+1rem)*2)] w-full"
          :style="{ background: 'linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 50%)' }"
        />
      </div>
    </div>

    <div class="flex justify-end">
      <button
        class="rounded-lg bg-primary-500 px-4 py-2 text-sm text-white font-medium shadow transition-transform disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-0.5"
        :disabled="!selectedOption || busy"
        @click="applySelection"
      >
        {{ busy ? 'Sampling...' : 'Use this background' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
DO NOT ATTEMPT TO USE backdrop-filter TOGETHER WITH mask-image.

html - Why doesn't blur backdrop-filter work together with mask-image? - Stack Overflow
https://stackoverflow.com/questions/72780266/why-doesnt-blur-backdrop-filter-work-together-with-mask-image
*/
.transparent-gradient-overlay {
  --gradient: linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 50%);
  -webkit-mask-image: var(--gradient);
  mask-image: var(--gradient);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: bottom;
  mask-position: bottom;
}
</style>
