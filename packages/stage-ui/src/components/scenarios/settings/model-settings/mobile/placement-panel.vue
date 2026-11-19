<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import Ruler from './ruler.vue'
import ToolPanel from './tool-panel.vue'

const scale = defineModel<number>('scale', { required: true })
const position = defineModel<{ x: number, y: number }>('position', { required: true })
const tool = defineModel<'size' | 'position'>('tool', { default: 'size' })
const { t } = useI18n()

const tools = computed(() => [
  { id: 'size' as const, label: t('settings.pages.models.editor.tools.size'), icon: 'i-mingcute:zoom-in-line', changed: scale.value !== 1 },
  { id: 'position' as const, label: t('settings.pages.models.editor.tools.position'), icon: 'i-mingcute:move-line', changed: position.value.x !== 0 || position.value.y !== 0 },
])
const horizontal = computed({
  get: () => position.value.x,
  set: (x: number) => { position.value = { ...position.value, x } },
})
const vertical = computed({
  get: () => position.value.y,
  set: (y: number) => { position.value = { ...position.value, y } },
})

/** Matches the scale label in both mobile placement entry points. */
function formatScale(value: number) {
  return `${value.toFixed(2)}×`
}

/** Shows signed stage percentages so each axis names the direction of movement. */
function formatOffset(value: number) {
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`
}
</script>

<template>
  <ToolPanel v-model="tool" :label="t('settings.pages.models.editor.tabs.placement')" :tools="tools">
    <template #size>
      <Ruler
        v-model="scale"
        :label="t('settings.pages.models.editor.tools.size')"
        :min="0.1" :max="3" :step="0.01" :default-value="1" :format="formatScale"
      />
    </template>
    <template #position>
      <div :class="['flex flex-col gap-0.5']">
        <span :class="['text-sm font-semibold text-neutral-900 dark:text-neutral-50']">
          {{ t('settings.pages.models.editor.tools.position') }}
        </span>
        <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.models.editor.position.description') }}
        </span>
      </div>
      <Ruler
        v-model="horizontal"
        :label="t('settings.pages.models.editor.position.horizontal')"
        :min="-100" :max="100" :step="1" :default-value="0" :format="formatOffset"
      />
      <Ruler
        v-model="vertical"
        :label="t('settings.pages.models.editor.position.vertical')"
        :min="-100" :max="100" :step="1" :default-value="0" :format="formatOffset"
      />
    </template>
  </ToolPanel>
</template>
