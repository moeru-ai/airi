<script setup lang="ts">
import type { Ref, ShallowRef } from 'vue'

import type { BackgroundOption } from './types'

import { BasicInputFile } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { colorFromElement, patchThemeSamplingHtml2CanvasClone } from '../../../../libs'
import { useSettings } from '../../../../stores/settings'
import { BackgroundGradientOverlay } from '../../../layouts/backgrounds'

const props = withDefaults(defineProps<{
  options: BackgroundOption[]
  allowUpload?: boolean
  idPrefix?: string
}>(), {
  allowUpload: false,
  idPrefix: 'background-',
})

const emit = defineEmits<{
  (e: 'apply', payload: { option: BackgroundOption, color?: string }): void
  (e: 'import', payload: { option: BackgroundOption, color?: string }): void
  (e: 'change', payload: { option: BackgroundOption | undefined }): void
  (e: 'remove', option: BackgroundOption): void
}>()

const { themeColorsHue } = useSettings()

const modelValue = defineModel<BackgroundOption | undefined>({ default: undefined })

const previewRef = ref<HTMLElement | null>(null)
const uploadingFiles = ref<File[]>([])
const customOptions = ref<BackgroundOption[]>([])
const blobRefs = new Map<string, ShallowRef<Blob | undefined>>()
const urlRefs = new Map<string, Readonly<Ref<string | undefined>>>()
const selectedId = ref<string | undefined>(modelValue.value?.id)
const busy = ref(false)

const mergedOptions = computed(() => {
  const propIds = new Set(props.options.map(o => o.id))
  return [...props.options, ...customOptions.value.filter(o => !propIds.has(o.id))]
})
const selectedOption = computed(() => mergedOptions.value.find(option => option.id === selectedId.value))
const enableBlur = ref(modelValue.value?.blur ?? false)
const previewColor = ref<string | undefined>(undefined)

watch(() => modelValue.value?.id, (id) => {
  if (id === undefined)
    return
  enableBlur.value = modelValue.value?.blur ?? false
})

function ensureObjectUrl(id: string, file: File) {
  let blobRef = blobRefs.get(id)
  let urlRef = urlRefs.get(id)

  if (!blobRef || !urlRef) {
    blobRef = shallowRef<Blob | undefined>(file)
    blobRefs.set(id, blobRef)
    urlRef = useObjectUrl(blobRef)
    urlRefs.set(id, urlRef)
  }

  if (blobRef.value !== file)
    blobRef.value = file

  return urlRef!.value!
}

async function waitForPreviewReady() {
  await nextTick()
  const image = previewRef.value?.querySelector('img')
  if (image && !image.complete) {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => reject(new Error('Preview image failed to load')), { once: true })
      }),
      new Promise<void>(resolve => setTimeout(resolve, 3000)), // 3s timeout safety
    ])
  }
}

onScopeDispose(() => {
  blobRefs.clear()
  urlRefs.clear()
})

watch(modelValue, (value) => {
  selectedId.value = value?.id
})

let previewSamplingToken = 0

watch(selectedOption, async (option) => {
  const token = ++previewSamplingToken
  previewColor.value = undefined
  emit('change', { option })
  if (option?.kind === 'wave') {
    previewColor.value = themeColorsHue.toString()
  }
  else if (option) {
    await waitForPreviewReady()
    const result = await colorFromElement(previewRef.value!, {
      mode: 'html2canvas',
      html2canvas: {
        region: {
          x: 0,
          y: 0,
          width: previewRef.value!.offsetWidth,
          height: Math.min(120, previewRef.value!.offsetHeight),
        },
        scale: 0.2, // Use a small scale for faster preview sampling
        backgroundColor: null,
        allowTaint: true,
        useCORS: true,
        onclone: patchThemeSamplingHtml2CanvasClone,
      },
    })
    if (token === previewSamplingToken)
      previewColor.value = result.html2canvas?.average
  }
  else {
    previewColor.value = undefined
  }
})

function getPreviewSrc(option?: BackgroundOption) {
  if (!option)
    return ''

  if (option.file) {
    return ensureObjectUrl(option.id, option.file)
  }

  return option.src ?? ''
}

async function handleFilesChange(files: File[]) {
  for (const file of files) {
    const option: BackgroundOption = {
      id: `${props.idPrefix}custom-${nanoid(6)}`,
      label: file.name || 'Custom Background',
      file,
      kind: 'image',
    }
    customOptions.value.push(option)
    selectedId.value = option.id

    // Auto-persist: wait for preview to be ready and trigger apply logic
    await nextTick()
    await applySelection(true)
  }
}

watch(uploadingFiles, (files) => {
  handleFilesChange(files ?? [])
})

async function applySelection(isImport = false) {
  if (!selectedOption.value)
    return

  // If we are already sampling (from the watcher), wait for it or use the current previewColor
  // For auto-import, we might want to wait a bit to get a real color, or just use what we have.

  busy.value = true
  try {
    if (selectedOption.value.kind === 'wave') {
      const color = themeColorsHue.toString()

      const payload = { option: { ...selectedOption.value, blur: enableBlur.value }, color }
      if (isImport)
        (emit as any)('import', payload)
      else
        (emit as any)('apply', payload)
      return
    }

    // For standard images, we use the color already being sampled by the watcher.
    // If it's not ready yet, we wait a bit for it.
    if (!previewColor.value) {
      await waitForPreviewReady()
      // Give it a tiny bit more time for the watcher's sampling to finish
      if (!previewColor.value)
        await new Promise(resolve => setTimeout(resolve, 300))
    }

    const payload = { option: { ...selectedOption.value, blur: enableBlur.value }, color: previewColor.value }
    if (isImport)
      (emit as any)('import', payload)
    else
      (emit as any)('apply', payload)
  }
  catch (error) {
    console.error('Background application failed:', error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div class="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-1 scrollbar-none">
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
          <button
            v-for="option in mergedOptions"
            :key="option.id"
            type="button"
            class="background-option group relative border-2 rounded-xl bg-neutral-100/80 p-2 text-left transition-colors dark:bg-neutral-900/80"
            :class="[option.id === selectedId ? 'selected border-primary-500/80 shadow-primary-500/10 shadow-lg' : 'border-neutral-200 dark:border-neutral-800']"
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
            <div
              v-if="option.removable"
              class="trash-button absolute right-2 top-2 z-10 flex cursor-pointer items-center justify-center rounded-full bg-neutral-200/50 p-1 text-neutral-600 backdrop-blur-md transition-opacity dark:bg-neutral-800/50"
              :class="[option.id === selectedId ? 'opacity-100' : 'opacity-0']"
              title="Remove background"
              @click.stop="emit('remove', option)"
            >
              <div class="i-solar:trash-bin-trash-bold h-4 w-4" />
            </div>
          </button>
        </div>

        <div v-if="allowUpload" class="flex flex-wrap gap-2">
          <BasicInputFile v-model="uploadingFiles" class="cursor-pointer">
            <div class="upload-button flex items-center gap-2 border border-neutral-300 rounded-lg border-dashed px-3 py-2 text-sm text-neutral-600 transition-colors dark:border-neutral-700 dark:text-neutral-300">
              <div i-solar:add-square-linear />
              <span>Add custom background</span>
            </div>
          </BasicInputFile>
        </div>

        <div class="border border-neutral-200 rounded-xl bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/70">
          <p class="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
            Preview
          </p>
          <label
            v-if="selectedOption?.kind !== 'wave'"
            class="flex items-center gap-2 pb-2 text-sm text-neutral-700 dark:text-neutral-200"
          >
            <input v-model="enableBlur" type="checkbox" class="accent-primary-500">
            <span>Blur</span>
          </label>
          <div
            ref="previewRef"
            class="relative h-48 overflow-hidden border border-neutral-200 rounded-xl bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
          >
            <div
              class="h-full w-full transition-all duration-300"
              :class="[(enableBlur && selectedOption?.kind !== 'wave') ? 'blur-md scale-110' : '']"
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
            </div>
            <BackgroundGradientOverlay v-if="(selectedOption as any)?.kind !== 'wave'" :color="previewColor" />
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-end bg-inherit pt-4">
      <button
        class="apply-button rounded-lg bg-primary-500 px-4 py-2 text-sm text-white font-medium shadow transition-transform disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="!selectedOption || busy"
        @click="() => applySelection()"
      >
        {{ busy ? 'Sampling...' : 'Use this background' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
@media (hover: hover) {
  .background-option:hover:not(.selected) {
    --at-apply: border-primary-400/80;
  }

  .background-option:hover .trash-button {
    --at-apply: opacity-100;
  }

  .trash-button:hover {
    --at-apply: bg-red-500 text-white;
  }

  .upload-button:hover {
    --at-apply: border-primary-400 text-primary-500 dark:border-primary-400 dark:text-primary-400;
  }

  .apply-button:hover:not(:disabled) {
    --at-apply: -translate-y-0.5;
  }
}
</style>
