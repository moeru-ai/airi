<script setup lang="ts">
import type { MemoryEntry } from '@proj-airi/stage-ui/types/memory'

import { errorMessageFrom } from '@moeru/std'
import { useMemoryConsolidation } from '@proj-airi/stage-ui/composables/memory-consolidation'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { memorySearchKey } from './memory-long-term-memories.search'

const { t } = useI18n()
const memory = useMemoryStore()
const { cards } = storeToRefs(useAiriCardStore())

const KEY = 'settings.pages.modules.memory-long-term.memories'

/** General memories first, then each character card, and any other card id that kept a memory. */
const groups = computed(() => {
  const personas = new Map<string, string>()
  for (const [id, card] of cards.value)
    personas.set(id, card.name || id)
  for (const entry of memory.entries) {
    if (entry.persona && !personas.has(entry.persona))
      personas.set(entry.persona, entry.persona)
  }
  return [
    { key: 'general', persona: undefined, title: t(`${KEY}.general`), icon: 'i-solar:global-bold-duotone', entries: memory.entries.filter(entry => !entry.persona) },
    ...[...personas].map(([id, name]) => ({ key: id, persona: id, title: name, icon: 'i-solar:user-rounded-bold-duotone', entries: memory.entries.filter(entry => entry.persona === id) })),
  ]
})

function remove(entry: MemoryEntry) {
  void memory.remove(entry)
}

const { consolidate } = useMemoryConsolidation()
/** The card whose memories are being tidied up. One tidy-up runs at a time. */
const consolidating = ref<string>()
/** Why the last tidy-up of a card failed, by card id. */
const consolidateErrors = ref<Record<string, string>>({})

async function tidy(persona: string) {
  consolidating.value = persona
  const { [persona]: _previous, ...others } = consolidateErrors.value
  consolidateErrors.value = others
  try {
    await consolidate(persona)
  }
  catch (error) {
    consolidateErrors.value = { ...consolidateErrors.value, [persona]: errorMessageFrom(error) ?? '' }
  }
  finally {
    consolidating.value = undefined
  }
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
      <div :class="['flex items-center', 'gap-2']">
        <h2 :class="['min-w-0 flex-1', 'flex items-center', 'gap-2', 'text-sm font-medium']">
          <span :class="[group.icon, 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
          <span :class="['min-w-0 flex-1', 'truncate']">{{ group.title }}</span>
          <span :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">{{ group.entries.length }}</span>
        </h2>
        <!-- A tidy-up merges entries, so a card needs two of them. Only the owner tidies up, and only a card's own memories. -->
        <GhostButton
          v-if="group.persona && group.entries.length > 1"
          size="sm"
          icon="i-solar:magic-stick-linear"
          :label="t(`${KEY}.consolidate`)"
          :title="t(`${KEY}.consolidate_hint`, { name: group.title })"
          :loading="consolidating === group.persona"
          :disabled="consolidating !== undefined"
          @click="tidy(group.persona)"
        />
      </div>
      <p v-if="group.persona && consolidateErrors[group.persona] !== undefined" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.consolidate_failed`, { error: consolidateErrors[group.persona] }) }}
      </p>
      <ul v-if="group.entries.length" :class="['flex flex-col', 'gap-2']">
        <li
          v-for="entry in group.entries"
          :key="entry.id"
          :data-settings-search="memorySearchKey(entry)"
          :class="['flex items-start', 'gap-3', 'rounded-lg', 'bg-white dark:bg-neutral-900/60', 'px-3 py-2.5']"
        >
          <div :class="['min-w-0 flex-1', 'flex flex-col', 'gap-0.5']">
            <span v-if="entry.description" :class="['text-sm font-medium', 'break-words']">{{ entry.description }}</span>
            <p :class="['pt-1', 'text-sm', 'whitespace-pre-wrap break-words']">
              {{ entry.body }}
            </p>
          </div>
          <GhostButton
            v-if="entry.persona"
            size="sm"
            icon="i-solar:global-linear"
            :aria-label="t(`${KEY}.make_general`, { name: entry.description || entry.body })"
            :title="t(`${KEY}.make_general`, { name: entry.description || entry.body })"
            @click="memory.makeGeneral(entry)"
          />
          <GhostButton size="sm" icon="i-solar:trash-bin-minimalistic-linear" :aria-label="t(`${KEY}.forget`, { name: entry.description || entry.body })" :title="t(`${KEY}.forget`, { name: entry.description || entry.body })" @click="remove(entry)" />
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
