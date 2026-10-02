<script setup lang="ts">
import type { MemoryVisibility } from '@proj-airi/stage-ui/stores/memory'

import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { useSettingsSessionLifecycle } from '@proj-airi/stage-ui/stores/settings'
import { FieldInput, GhostButton, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { positiveNumberModel } from '../../../libs/number-model'

const { t } = useI18n()
const { retireAfterDays } = storeToRefs(useSettingsSessionLifecycle())
const retireAfterDaysModel = positiveNumberModel(retireAfterDays)

const memory = useMemoryStore()
const KEY = 'settings.pages.modules.memory-long-term.memories'
const visibilityOptions = computed(() => [
  { label: t(`${KEY}.visibility.owner`), value: 'owner' as const },
  { label: t(`${KEY}.visibility.shared`), value: 'shared' as const },
])

function setVisibility(name: string, visibility: MemoryVisibility) {
  const entry = memory.entries.find(candidate => candidate.name === name)
  if (entry)
    memory.write({ ...entry, visibility })
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <RouterLink
      to="/settings/modules/memory-long-term-recipes"
      :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex items-center', 'gap-3', 'transition-colors', 'hover:bg-neutral-100 dark:hover:bg-neutral-700']"
    >
      <div :class="['i-solar:book-bookmark-bold-duotone', 'text-2xl', 'text-primary-500 dark:text-primary-400']" />
      <div :class="['flex-1', 'flex flex-col', 'gap-1']">
        <span :class="['text-lg font-medium']">{{ t('settings.pages.modules.memory-long-term.recipes.entry.title') }}</span>
        <span :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.modules.memory-long-term.recipes.entry.description') }}</span>
      </div>
      <div :class="['i-solar:alt-arrow-right-linear', 'text-neutral-400']" />
    </RouterLink>
    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t(`${KEY}.title`) }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t(`${KEY}.description`) }}
        </p>
      </div>
      <ul v-if="memory.entries.length" :class="['flex flex-col', 'gap-2']">
        <li
          v-for="entry in memory.entries"
          :key="entry.name"
          :class="['flex flex-col', 'gap-2', 'rounded-lg', 'bg-white dark:bg-neutral-900/60', 'px-3 py-2.5']"
        >
          <div :class="['flex items-center', 'gap-2']">
            <span :class="['min-w-0 flex-1', 'truncate', 'text-sm font-medium']">{{ entry.name }}</span>
            <SelectTab
              :model-value="entry.visibility"
              :options="visibilityOptions"
              size="xs"
              tab-space="compact"
              @update:model-value="value => setVisibility(entry.name, value)"
            />
            <GhostButton size="sm" icon="i-solar:trash-bin-minimalistic-linear" :aria-label="t(`${KEY}.forget`, { name: entry.name })" :title="t(`${KEY}.forget`, { name: entry.name })" @click="memory.forget(entry.name)" />
          </div>
          <span v-if="entry.description" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ entry.description }}</span>
          <p :class="['text-sm', 'whitespace-pre-wrap break-words']">
            {{ entry.body }}
          </p>
        </li>
      </ul>
      <p v-else :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.empty`) }}
      </p>
    </section>
    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.modules.memory-long-term.sessions.title') }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.memory-long-term.sessions.description') }}
        </p>
      </div>
      <FieldInput
        v-model="retireAfterDaysModel"
        type="number"
        :label="t('settings.pages.modules.memory-long-term.sessions.retire_after.label')"
        :description="t('settings.pages.modules.memory-long-term.sessions.retire_after.description')"
      />
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
