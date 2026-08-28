<script setup lang="ts">
import type { ScreenAmbientLightDiagnosticsSnapshot } from '../../../../shared/screen-ambient-light-diagnostics'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  diagnostics: ScreenAmbientLightDiagnosticsSnapshot
}>()

const { t } = useI18n()
const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
})
const statusLabel = computed(() => t(`tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.status.${props.diagnostics.status}`))
const captureRows = computed(() => [
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.display'),
    value: props.diagnostics.display
      ? `${props.diagnostics.display.id} · ${formatRectangle(props.diagnostics.display.bounds)}`
      : '—',
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.video-size'),
    value: props.diagnostics.videoSize
      ? `${props.diagnostics.videoSize.width} × ${props.diagnostics.videoSize.height}`
      : '—',
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.sample-size'),
    value: props.diagnostics.frame
      ? `${props.diagnostics.frame.width} × ${props.diagnostics.frame.height}`
      : '—',
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.window-bounds'),
    value: props.diagnostics.windowBounds ? formatRectangle(props.diagnostics.windowBounds) : '—',
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.excluded-region'),
    value: props.diagnostics.excludedRegion ? formatNormalizedRectangle(props.diagnostics.excludedRegion) : '—',
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.direction'),
    value: `${props.diagnostics.direction.x.toFixed(3)}, ${props.diagnostics.direction.y.toFixed(3)}`,
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.updated'),
    value: timestampFormatter.format(props.diagnostics.publishedAt),
  },
])
const pixelRows = computed(() => {
  const sampling = props.diagnostics.sampling
  if (!sampling)
    return []

  return [
    {
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.total'),
      value: sampling.totalPixelCount,
    },
    {
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.accepted'),
      value: sampling.acceptedPixelCount,
    },
    {
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.excluded'),
      value: sampling.excludedPixelCount,
    },
    {
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.transparent'),
      value: sampling.transparentPixelCount,
    },
    {
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.black'),
      value: sampling.blackPixelCount,
    },
    {
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.white'),
      value: sampling.whitePixelCount,
    },
  ]
})

function formatRectangle(rectangle: { x: number, y: number, width: number, height: number }) {
  return `${Math.round(rectangle.x)}, ${Math.round(rectangle.y)} · ${Math.round(rectangle.width)} × ${Math.round(rectangle.height)}`
}

function formatNormalizedRectangle(rectangle: { x: number, y: number, width: number, height: number }) {
  return `${formatPercent(rectangle.x)}, ${formatPercent(rectangle.y)} · ${formatPercent(rectangle.width)} × ${formatPercent(rectangle.height)}`
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <div :class="['grid gap-4']">
    <div :class="['flex flex-wrap items-center justify-between gap-3']">
      <div>
        <div :class="['text-sm font-medium']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.title') }}
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.capture.description') }}
        </div>
      </div>
      <div :class="['rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium dark:bg-neutral-800']">
        {{ statusLabel }}
      </div>
    </div>

    <div
      v-if="diagnostics.error"
      :class="['rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300']"
    >
      {{ diagnostics.error }}
    </div>

    <dl :class="['grid gap-2', 'md:grid-cols-2']">
      <div
        v-for="row in captureRows"
        :key="row.label"
        :class="['rounded-lg bg-neutral-100/70 px-3 py-2 dark:bg-neutral-800/70']"
      >
        <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ row.label }}
        </dt>
        <dd :class="['mt-0.5 break-all font-mono text-xs tabular-nums']">
          {{ row.value }}
        </dd>
      </div>
    </dl>

    <div v-if="diagnostics.sampling" :class="['grid gap-2']">
      <div :class="['text-sm font-medium']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.title') }}
      </div>
      <div :class="['grid grid-cols-2 gap-2', 'md:grid-cols-3 xl:grid-cols-6']">
        <div
          v-for="row in pixelRows"
          :key="row.label"
          :class="['rounded-lg bg-neutral-100/70 px-3 py-2 dark:bg-neutral-800/70']"
        >
          <div :class="['font-mono text-sm tabular-nums']">
            {{ row.value }}
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ row.label }}
          </div>
        </div>
      </div>
      <div :class="['grid grid-cols-2 gap-2']">
        <div :class="['rounded-lg bg-neutral-100/70 px-3 py-2 dark:bg-neutral-800/70']">
          <div :class="['font-mono text-sm tabular-nums']">
            {{ formatPercent(diagnostics.sampling.averageSaturation) }}
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.average-saturation') }}
          </div>
        </div>
        <div :class="['rounded-lg bg-neutral-100/70 px-3 py-2 dark:bg-neutral-800/70']">
          <div :class="['font-mono text-sm tabular-nums']">
            {{ diagnostics.sampling.weightTotal.toFixed(2) }}
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.pixels.weight-total') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
