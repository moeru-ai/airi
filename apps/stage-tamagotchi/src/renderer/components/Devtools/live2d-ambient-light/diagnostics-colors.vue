<script setup lang="ts">
import type { AmbientLightMap } from '@proj-airi/stage-shared/screen-ambient-light'
import type { ComponentPublicInstance } from 'vue'

import type { ScreenAmbientLightDiagnosticsSnapshot } from '../../../../shared/screen-ambient-light-diagnostics'

import { ambientLightMapMargin } from '@proj-airi/stage-shared/screen-ambient-light'
import { computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  sampling?: ScreenAmbientLightDiagnosticsSnapshot['sampling']
}>()

/**
 * Part of a map that the AIRI window covers, as a fraction of the map.
 *
 * The map reaches half a window past every edge, so the window sits in the
 * middle half of it. The outline marks that part, which is what the character
 * stands in front of.
 */
const windowInsetStyle = {
  left: `${(ambientLightMapMargin / (1 + 2 * ambientLightMapMargin)) * 100}%`,
  top: `${(ambientLightMapMargin / (1 + 2 * ambientLightMapMargin)) * 100}%`,
  width: `${(1 / (1 + 2 * ambientLightMapMargin)) * 100}%`,
  height: `${(1 / (1 + 2 * ambientLightMapMargin)) * 100}%`,
}

const { t } = useI18n()
// The canvases sit inside two nested v-for loops, so a keyed map is what
// connects one drawing target to the row that owns it.
const canvases = new Map<string, HTMLCanvasElement>()
const maps = computed(() => (['surround', 'contact'] as const).map(kind => ({
  id: kind,
  label: t(`tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.maps.${kind}.title`),
  description: t(`tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.maps.${kind}.description`),
  rows: [
    {
      id: `${kind}-target`,
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.maps.target'),
      map: props.sampling?.targetEnvironment?.[kind],
    },
    {
      id: `${kind}-applied`,
      label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.maps.applied'),
      map: props.sampling?.appliedEnvironment?.[kind],
    },
  ],
})))

watch(maps, async (current) => {
  await nextTick()
  for (const entry of current) {
    for (const row of entry.rows) {
      const canvas = canvases.get(row.id)
      if (canvas && row.map)
        drawMap(canvas, row.map)
    }
  }
}, { immediate: true })

function setCanvas(id: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLCanvasElement)
    canvases.set(id, element)
  else
    canvases.delete(id)
}

/** Draws one map texel per canvas pixel. CSS scales it up without smoothing. */
function drawMap(canvas: HTMLCanvasElement, map: AmbientLightMap) {
  const context = canvas.getContext('2d')
  if (!context)
    return

  const image = context.createImageData(map.width, map.height)
  for (let texel = 0; texel < map.width * map.height; texel += 1) {
    image.data[texel * 4] = toByte(map.data[texel * 3])
    image.data[texel * 4 + 1] = toByte(map.data[texel * 3 + 1])
    image.data[texel * 4 + 2] = toByte(map.data[texel * 3 + 2])
    image.data[texel * 4 + 3] = 255
  }
  context.putImageData(image, 0, 0)
}

/** The map holds linear light, and a canvas expects the sRGB encoding. */
function toByte(linear: number) {
  const clamped = Math.min(1, Math.max(0, linear))
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(encoded * 255)
}
</script>

<template>
  <div :class="['grid gap-2']">
    <div>
      <div :class="['text-sm font-medium']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.maps.title') }}
      </div>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.maps.window') }}
      </div>
    </div>
    <div :class="['grid gap-2', 'md:grid-cols-2']">
      <div
        v-for="entry in maps"
        :key="entry.id"
        :class="['grid gap-3 rounded-xl bg-neutral-100/70 p-3 dark:bg-neutral-800/70']"
      >
        <div>
          <div :class="['text-sm font-medium']">
            {{ entry.label }}
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ entry.description }}
          </div>
        </div>
        <div :class="['grid grid-cols-2 gap-2']">
          <div
            v-for="row in entry.rows"
            :key="row.id"
            :class="['grid gap-1']"
          >
            <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ row.label }}
            </div>
            <div
              v-if="row.map"
              :class="[
                'relative overflow-hidden rounded-lg border border-neutral-300',
                'dark:border-neutral-700',
              ]"
            >
              <canvas
                :ref="element => setCanvas(row.id, element)"
                :width="row.map.width"
                :height="row.map.height"
                :class="['block h-auto w-full [image-rendering:pixelated]']"
              />
              <div
                :class="['pointer-events-none absolute border border-white/70 mix-blend-difference']"
                :style="windowInsetStyle"
              />
            </div>
            <div v-else :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.maps.unavailable') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
