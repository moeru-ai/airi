<script setup lang="ts">
import type { StageThreeRuntimeResourceSnapshotRecord } from '../../stores/stage-three-runtime-diagnostics'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  snapshots: readonly StageThreeRuntimeResourceSnapshotRecord[]
}>()

const { t } = useI18n()
const columns = ['time', 'phase', 'reason', 'textures', 'geometries', 'meshes', 'materials'] as const

// History follows receipt order. Trace timestamps use performance.now() in the
// source renderer, so sorting them across renderers can reorder received events.
const rows = computed(() => props.snapshots.toReversed().map(snapshot => [
  snapshot.ts.toFixed(2),
  snapshot.phase,
  snapshot.reason ?? 'n/a',
  snapshot.rendererMemory?.textures ?? 'n/a',
  snapshot.rendererMemory?.geometries ?? 'n/a',
  snapshot.sceneSummary?.meshCount ?? 'n/a',
  snapshot.sceneSummary?.materialCount ?? 'n/a',
]))
</script>

<template>
  <section :class="['mt-4 min-w-0 rounded-lg p-3 dark:p-0', 'bg-white dark:bg-transparent']">
    <h3 :class="['text-sm text-neutral-800 dark:text-neutral-200']">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.title') }}
    </h3>
    <p :class="['mb-2 mt-1 text-xs text-neutral-600 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.description') }}
    </p>
    <p v-if="rows.length === 0" :class="['py-3 text-sm text-neutral-600 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.empty') }}
    </p>
    <div
      v-else
      :class="[
        'max-h-72 overflow-auto rounded-lg',
        'border border-neutral-200 dark:border-neutral-700/60',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400',
      ]"
      role="region"
      :aria-label="t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.title')"
      tabindex="0"
    >
      <table :class="['w-full text-sm tabular-nums whitespace-nowrap', 'text-neutral-900 dark:text-neutral-100']">
        <caption :class="['sr-only']">
          {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.title') }}
        </caption>
        <thead :class="['sticky top-0 text-xs', 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400']">
          <tr>
            <th
              v-for="(column, index) in columns"
              :key="column"
              scope="col"
              :class="['px-3 py-2 font-medium', index === 1 || index === 2 ? 'text-left' : 'text-right']"
            >
              {{ t(`tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.columns.${column}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in rows" :key="rowIndex" :class="['border-t border-neutral-200 dark:border-neutral-700/40']">
            <td
              v-for="(cell, columnIndex) in row"
              :key="columns[columnIndex]"
              :class="['px-3 py-2', columnIndex === 1 || columnIndex === 2 ? 'text-left' : 'text-right']"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
