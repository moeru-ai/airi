<script setup lang="ts">
import type { ComputerUseWindow } from './schemas'
import type { ComputerUseViewOf } from './view'

import { computed } from 'vue'

import ToolCallScreenshot from '../tool-call-screenshot.vue'

import { useComputerUseScreenshots } from '../use-computer-use-screenshots'
import { CHIP, FACT_LABEL, FACT_VALUE, FACTS, LINE, LINE_ICON, ROW } from './classes'
import { rectText, sizeText, windowText } from './format'
import { useComputerUseLabels } from './use-labels'

/** A screen capture with its screenshot and its facts, or a list of displays or windows. */
const props = defineProps<{
  view: ComputerUseViewOf<'capture' | 'displays' | 'windows'>
}>()

const { t, locale, KEY } = useComputerUseLabels()

/** The screenshot of each artifact. A file that cannot be read shows no image. */
const images = useComputerUseScreenshots(() => props.view.kind === 'capture' ? props.view.files.map(file => file.file_path) : undefined)

/** The second line of a window row: its app, bundle, process, reference, and frame. A field without a value leaves no gap. */
function windowDetails(window: ComputerUseWindow) {
  return [window.app_name, window.app_bundle_id, window.process_id === null ? null : `pid ${window.process_id}`, `#${window.reference.id}`, rectText(window.frame)]
    .filter(Boolean)
    .join(' · ')
}

const fileSize = computed(() => new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }))

const captureFacts = computed(() => {
  const view = props.view
  if (view.kind !== 'capture')
    return []
  const { capture, display, window } = view
  return [
    ...(display
      ? [{ label: t(`${KEY}.display`), value: [display.name ?? `#${display.id}`, display.is_builtin && t(`${KEY}.built-in`), display.is_primary && t(`${KEY}.primary`)].filter(Boolean).join(' · ') }]
      : []),
    ...(window ? [{ label: t(`${KEY}.window`), value: windowText(window) }] : []),
    { label: t(`${KEY}.region`), value: rectText(capture.bounds) },
    { label: t(`${KEY}.logical-size`), value: `${sizeText(capture.bounds.size)} · ${capture.scale_factor}x` },
    { label: t(`${KEY}.pixel-size`), value: sizeText(capture.pixel_dimensions) },
    { label: t(`${KEY}.backend`), value: capture.backend },
    ...(capture.fallback_reason ? [{ label: t(`${KEY}.fallback`), value: capture.fallback_reason }] : []),
    ...view.files.map(file => ({ label: t(`${KEY}.file`), value: `${file.file_extension.toUpperCase()} · ${fileSize.value.format(file.byte_length / 1_000_000)}` })),
  ]
})
</script>

<template>
  <template v-if="props.view.kind === 'capture'">
    <template v-for="file in props.view.files" :key="file.file_path">
      <ToolCallScreenshot
        v-if="images.has(file.file_path)"
        :url="images.get(file.file_path)!"
        :title="file.file_path.split(/[\\/]/).at(-1) ?? ''"
      />
    </template>
    <div :class="FACTS">
      <template v-for="(fact, index) in captureFacts" :key="index">
        <span :class="FACT_LABEL">{{ fact.label }}</span>
        <span :class="FACT_VALUE">{{ fact.value }}</span>
      </template>
    </div>
  </template>

  <template v-else-if="props.view.kind === 'displays'">
    <span :class="LINE"><span :class="['i-mingcute:monitor-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.displays`, { count: props.view.displays.length }, props.view.displays.length) }}</span>
    <div :class="['flex flex-col gap-1']">
      <div v-for="display in props.view.displays" :key="display.id" :class="ROW">
        <span :class="[display.is_builtin ? 'i-mingcute:laptop-line' : 'i-mingcute:monitor-line', 'shrink-0 text-neutral-500']" aria-hidden="true" />
        <span :class="['min-w-0 flex flex-1 flex-col']">
          <span :class="['truncate']">{{ display.name ?? `#${display.id}` }}</span>
          <span :class="['text-[10px] tabular-nums text-neutral-400']">#{{ display.id }} · {{ rectText(display.frame) }} · {{ display.scale_factor }}x</span>
        </span>
        <span v-if="display.is_builtin" :class="CHIP">{{ t(`${KEY}.built-in`) }}</span>
        <span v-if="display.is_primary" :class="CHIP">{{ t(`${KEY}.primary`) }}</span>
      </div>
    </div>
  </template>

  <template v-else>
    <span :class="LINE"><span :class="['i-mingcute:layout-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.windows`, { count: props.view.windows.length }, props.view.windows.length) }}</span>
    <div :class="['flex flex-col gap-1']">
      <div v-for="window in props.view.windows" :key="window.reference.id" :class="ROW">
        <span :class="['min-w-0 flex flex-1 flex-col']">
          <span :class="['truncate']">{{ window.title || window.app_name || `#${window.reference.id}` }}</span>
          <span :class="['truncate text-[10px] tabular-nums text-neutral-400']">{{ windowDetails(window) }}</span>
        </span>
        <span v-if="window.is_main" :class="CHIP">{{ t(`${KEY}.main`) }}</span>
        <span v-if="!window.is_visible" :class="CHIP">{{ t(`${KEY}.hidden`) }}</span>
      </div>
    </div>
  </template>
</template>
