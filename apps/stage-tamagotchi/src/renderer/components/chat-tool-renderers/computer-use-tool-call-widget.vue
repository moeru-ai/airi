<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ToolCallScreenshot from './tool-call-screenshot.vue'

import { computerUseReadImage } from '../../../shared/eventa/computer-use'

interface Size { width: number, height: number }

/** An AUV command with its status. A screen capture also shows its screenshot and the display it captured. */
const props = defineProps<{
  command: string
  status: string
  capture?: {
    display: string
    builtIn: boolean
    primary: boolean
    logicalSize: Size
    pixelSize: Size
    scale: number
    backend: string
  }
  files?: Array<{ path: string, extension: string, bytes: number }>
}>()

const { t, te, locale } = useI18n()
const KEY = 'tamagotchi.stage.computer-use-tool-call'
const readImage = useElectronEventaInvoke(computerUseReadImage)

// AUV reports more states than the ones this card has words for. Those show as AUV names them.
const statusLabel = computed(() => te(`${KEY}.status.${props.status}`) ? t(`${KEY}.status.${props.status}`) : props.status)

/** The screenshot of each artifact, read from AIRI computer use storage. A file that cannot be read shows no image. */
const images = reactive(new Map<string, string>())

watch(() => props.files, async (files) => {
  for (const file of files ?? []) {
    try {
      images.set(file.path, await readImage({ path: file.path }))
    }
    catch {
      images.delete(file.path)
    }
  }
}, { immediate: true })

const sizeText = (size: Size) => `${size.width} × ${size.height}`
const fileSize = computed(() => new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }))

const facts = computed(() => {
  const capture = props.capture
  if (!capture)
    return []
  return [
    { label: t(`${KEY}.display`), value: [capture.display, capture.builtIn && t(`${KEY}.built-in`), capture.primary && t(`${KEY}.primary`)].filter(Boolean).join(' · ') },
    { label: t(`${KEY}.logical-size`), value: `${sizeText(capture.logicalSize)} · ${capture.scale}x` },
    { label: t(`${KEY}.pixel-size`), value: sizeText(capture.pixelSize) },
    { label: t(`${KEY}.backend`), value: capture.backend },
    ...(props.files ?? []).map(file => ({ label: t(`${KEY}.file`), value: `${file.extension.toUpperCase()} · ${fileSize.value.format(file.bytes / 1_000_000)}` })),
  ]
})
</script>

<template>
  <div :class="['flex flex-col gap-2 rounded-xl p-2.5', 'bg-white/75 dark:bg-neutral-800/60']">
    <div :class="['flex items-center justify-between gap-2']">
      <span :class="['min-w-0 inline-flex items-center gap-1.5 text-xs font-semibold', 'text-neutral-800 dark:text-neutral-100']">
        <span :class="['i-mingcute:terminal-box-line', 'shrink-0']" aria-hidden="true" />
        <code :class="['truncate']">{{ props.command }}</code>
      </span>
      <span :class="['shrink-0 inline-flex items-center gap-1 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
        <span :class="['size-1.5 rounded-full', props.status === 'completed' ? 'bg-emerald-500' : 'bg-neutral-400']" aria-hidden="true" />
        {{ statusLabel }}
      </span>
    </div>
    <template v-for="file in props.files ?? []" :key="file.path">
      <ToolCallScreenshot
        v-if="images.has(file.path)"
        :url="images.get(file.path)!"
        :title="file.path.split(/[\\/]/).at(-1) ?? ''"
      />
    </template>
    <div v-if="facts.length > 0" :class="['grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px]']">
      <template v-for="(fact, index) in facts" :key="index">
        <span :class="['text-neutral-500 dark:text-neutral-400']">{{ fact.label }}</span>
        <span :class="['min-w-0 break-words', 'text-neutral-800 dark:text-neutral-100']">{{ fact.value }}</span>
      </template>
    </div>
  </div>
</template>
