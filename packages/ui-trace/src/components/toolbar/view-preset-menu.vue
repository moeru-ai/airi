<script setup lang="ts">
import type { TracePresetDefinition } from '@proj-airi/trace-kit'

import { localize } from '@proj-airi/trace-kit'
import { DropdownMenu } from '@proj-airi/ui'
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The view preset of the timeline, as a small menu. A preset shows only the tracks that it matches. The user can still
 * show or hide each track from its label.
 */
const props = defineProps<{
  presets: TracePresetDefinition[]
  locale: string
}>()

/** The key of the active preset, or empty for every track. */
const preset = defineModel<string>({ required: true })

const { t } = useI18n()

const options = computed(() => [
  { label: t('tamagotchi.settings.devtools.pages.io-tracer.view.all'), value: '' },
  ...props.presets.map(candidate => ({ label: localize(candidate.label, props.locale) ?? candidate.key, value: candidate.key })),
])

const current = computed(() => options.value.find(option => option.value === preset.value)?.label ?? options.value[0]!.label)
</script>

<template>
  <DropdownMenu :modal="false" content-class="min-w-36">
    <template #trigger>
      <button
        type="button"
        :aria-label="t('tamagotchi.settings.devtools.pages.io-tracer.view.label')"
        :class="[
          'flex h-5 max-w-full items-center gap-1 rounded px-1.5 text-xs',
          'text-neutral-600 hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:bg-neutral-800',
        ]"
      >
        <span :class="['truncate']">{{ current }}</span>
        <span :class="['i-mingcute:down-small-line size-3.5 shrink-0']" />
      </button>
    </template>
    <DropdownMenuRadioGroup v-model="preset">
      <DropdownMenuRadioItem
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :class="[
          'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs outline-none',
          'data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-700',
        ]"
      >
        {{ option.label }}
        <span v-if="option.value === preset" :class="['i-mingcute:check-line size-3.5']" />
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  </DropdownMenu>
</template>
