<script setup lang="ts">
import { SelectTab } from '@proj-airi/ui'
import { ref } from 'vue'

const focusMode = ref<'mode-1' | 'mode-2' | 'mode-3'>('mode-1')
const quality = ref<'low' | 'balanced' | 'high'>('balanced')
const locked = ref<'auto' | 'manual'>('auto')

const focusOptions = [
  {
    label: 'Mode 1',
    value: 'mode-1' as const,
    icon: 'i-solar:widget-2-line-duotone',
  },
  {
    label: 'Mode 2',
    value: 'mode-2' as const,
    icon: 'i-solar:menu-dots-line-duotone',
  },
  {
    label: 'Mode 3',
    value: 'mode-3' as const,
    icon: 'i-solar:atoms-line-duotone',
  },
]

const qualityOptions = [
  { label: 'Light', value: 'low' as const },
  { label: 'Balanced', value: 'balanced' as const },
  { label: 'Detailed', value: 'high' as const },
]

const lockedOptions = [
  { label: 'Auto sync', value: 'auto' as const },
  { label: 'Manual', value: 'manual' as const },
]
</script>

<template>
  <Story
    title="SelectTab"
    group="misc"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Mode selection"
    >
      <div class="max-w-4xl w-full flex flex-col gap-4">
        <SelectTab v-model="focusMode" :options="focusOptions" />
        <p class="text-sm text-neutral-600 dark:text-neutral-300">
          Selected mode: {{ focusMode }}
        </p>
      </div>
    </Variant>

    <Variant
      id="with-descriptions"
      title="Sizing and descriptions"
    >
      <div class="max-w-3xl w-full flex flex-col gap-4">
        <SelectTab v-model="quality" size="sm" :options="qualityOptions" />
        <p class="text-sm text-neutral-600 dark:text-neutral-300">
          Rendering quality: {{ quality }}
        </p>
      </div>
    </Variant>

    <Variant
      id="disabled-readonly"
      title="Disabled and readonly states"
    >
      <div class="max-w-3xl w-full flex flex-col gap-4">
        <SelectTab v-model="locked" :options="lockedOptions" disabled />
        <SelectTab v-model="locked" :options="lockedOptions" readonly />
        <p class="text-sm text-neutral-600 dark:text-neutral-300">
          Locked selection mirrors both states: {{ locked }}
        </p>
      </div>
    </Variant>
  </Story>
</template>
