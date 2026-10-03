<script setup lang="ts">
import type { MemoryEntry } from '@proj-airi/stage-ui/stores/memory'

import { modePersonaId } from '@proj-airi/stage-ui/stores/chat'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'
import { GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memory = useMemoryStore()
const { cards } = storeToRefs(useAiriCardStore())
const { recipes } = storeToRefs(useRecipesStore())

const KEY = 'settings.pages.modules.memory-long-term.memories'

/** General memories first, then every persona: each character card, each mode, and any other persona that kept a memory. */
const groups = computed(() => {
  const personas = new Map<string, string>()
  for (const [id, card] of cards.value)
    personas.set(id, card.name || id)
  for (const recipe of recipes.value.filter(entry => entry.handover))
    personas.set(modePersonaId(recipe.id), recipe.name)
  for (const entry of memory.entries) {
    if (entry.persona && !personas.has(entry.persona))
      personas.set(entry.persona, entry.persona)
  }
  return [
    { key: 'general', title: t(`${KEY}.general`), icon: 'i-solar:global-bold-duotone', entries: memory.entries.filter(entry => !entry.persona) },
    ...[...personas].map(([id, name]) => ({ key: id, title: name, icon: 'i-solar:user-rounded-bold-duotone', entries: memory.entries.filter(entry => entry.persona === id) })),
  ]
})

function remove(entry: MemoryEntry) {
  memory.remove(entry)
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t(`${KEY}.description`) }}
    </p>

    <section
      v-for="group in groups"
      :key="group.key"
      :class="['flex flex-col', 'gap-2', 'rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4']"
    >
      <h2 :class="['flex items-center', 'gap-2', 'text-sm font-medium']">
        <span :class="[group.icon, 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
        <span :class="['min-w-0 flex-1', 'truncate']">{{ group.title }}</span>
        <span :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">{{ group.entries.length }}</span>
      </h2>
      <ul v-if="group.entries.length" :class="['flex flex-col', 'gap-2']">
        <li
          v-for="entry in group.entries"
          :key="entry.name"
          :class="['flex items-start', 'gap-3', 'rounded-lg', 'bg-white dark:bg-neutral-900/60', 'px-3 py-2.5']"
        >
          <div :class="['min-w-0 flex-1', 'flex flex-col', 'gap-0.5']">
            <span :class="['truncate', 'text-sm font-medium']">{{ entry.name }}</span>
            <span v-if="entry.description" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ entry.description }}</span>
            <p :class="['pt-1', 'text-sm', 'whitespace-pre-wrap break-words']">
              {{ entry.body }}
            </p>
          </div>
          <GhostButton size="sm" icon="i-solar:trash-bin-minimalistic-linear" :aria-label="t(`${KEY}.forget`, { name: entry.name })" :title="t(`${KEY}.forget`, { name: entry.name })" @click="remove(entry)" />
        </li>
      </ul>
      <p v-else :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.empty`) }}
      </p>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.memories.title
  subtitleKey: settings.pages.modules.memory-long-term.title
  stageTransition:
    name: slide
</route>
