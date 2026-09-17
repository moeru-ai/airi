<script setup lang="ts">
import type { useStageThreeRuntimeDiagnosticsStore } from '../../stores/stage-three-runtime-diagnostics'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  events: Readonly<ReturnType<typeof useStageThreeRuntimeDiagnosticsStore>['resourceSnapshots']['history']>
}>()

const { t } = useI18n()
// The store appends the oldest event first. The table shows the newest event first.
const newestFirst = computed(() => [...props.events].reverse())

function formatFloat(value?: number, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : 'n/a'
}

function formatCount(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : 'n/a'
}
</script>

<template>
  <div>
    <table
      v-if="newestFirst.length"
      :class="['w-full text-left text-sm text-neutral-100']"
    >
      <thead>
        <tr :class="['text-xs text-neutral-400 uppercase tracking-wide']">
          <th scope="col" :class="['py-1 pr-3 font-medium']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.time') }}
          </th>
          <th scope="col" :class="['py-1 pr-3 font-medium']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.phase') }}
          </th>
          <th scope="col" :class="['py-1 pr-3 font-medium']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.reason') }}
          </th>
          <th scope="col" :class="['py-1 pr-3 font-medium']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.textures') }}
          </th>
          <th scope="col" :class="['py-1 pr-3 font-medium']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.geometries') }}
          </th>
          <th scope="col" :class="['py-1 pr-3 font-medium']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.meshes') }}
          </th>
          <th scope="col" :class="['py-1 font-medium']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.materials') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(event, index) in newestFirst"
          :key="index"
          :class="['border-t border-neutral-700/60']"
        >
          <td :class="['py-1 pr-3']">
            {{ formatFloat(event.ts) }}
          </td>
          <td :class="['py-1 pr-3']">
            {{ event.phase }}
          </td>
          <td :class="['py-1 pr-3']">
            {{ event.reason || 'n/a' }}
          </td>
          <td :class="['py-1 pr-3']">
            {{ formatCount(event.rendererMemory?.textures) }}
          </td>
          <td :class="['py-1 pr-3']">
            {{ formatCount(event.rendererMemory?.geometries) }}
          </td>
          <td :class="['py-1 pr-3']">
            {{ formatCount(event.sceneSummary?.meshCount) }}
          </td>
          <td :class="['py-1']">
            {{ formatCount(event.sceneSummary?.materialCount) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div
      v-else
      :class="['text-sm text-neutral-400']"
    >
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.resource-events.empty') }}
    </div>
  </div>
</template>
