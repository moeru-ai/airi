<script setup lang="ts">
import { useAiriCardStore, useTextJournalStore } from '@proj-airi/stage-ui/stores'
import { Button, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

interface CharacterOption { value: string, label: string }

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const cardStore = useAiriCardStore()
const textJournalStore = useTextJournalStore()

const { cards, activeCardId } = storeToRefs(cardStore)
const { entries, loading } = storeToRefs(textJournalStore)

const selectedCharacter = ref('all')
const searchTerm = ref('')

const characterOptions = computed<CharacterOption[]>(() => {
  const options = Array.from(cards.value.entries()).map(([id, card]) => ({
    value: id,
    label: card.nickname?.trim() ? `${card.name} (${card.nickname.trim()})` : card.name,
  }))

  return [
    { value: 'all', label: 'All Characters' },
    ...options,
  ]
})

const visibleEntries = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()

  return entries.value.filter((entry) => {
    const matchesCharacter = selectedCharacter.value === 'all' || entry.characterId === selectedCharacter.value
    const matchesTerm = !term
      || entry.title.toLowerCase().includes(term)
      || entry.content.toLowerCase().includes(term)
      || entry.characterName.toLowerCase().includes(term)

    return matchesCharacter && matchesTerm
  })
})

async function seedEntry() {
  try {
    const entry = await textJournalStore.seedActiveCharacterEntry()
    toast.success(`Seeded journal entry for ${entry.characterName}.`)
    if (selectedCharacter.value === 'all' && activeCardId.value)
      selectedCharacter.value = activeCardId.value
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`Failed to seed journal entry: ${message}`)
  }
}

onMounted(async () => {
  cardStore.initialize()
  await textJournalStore.load()

  if (activeCardId.value && selectedCharacter.value === 'all')
    selectedCharacter.value = activeCardId.value
})

watch(characterOptions, (options) => {
  if (!options.some(option => option.value === selectedCharacter.value))
    selectedCharacter.value = activeCardId.value || 'all'
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="border border-neutral-200 rounded-2xl bg-neutral-100/90 p-5 dark:border-neutral-700 dark:bg-[rgba(0,0,0,0.26)]">
      <div class="mb-4 flex items-start gap-3">
        <div class="i-solar:notebook-bookmark-bold-duotone text-2xl text-emerald-500" />
        <div>
          <h2 class="text-lg text-neutral-700 md:text-2xl dark:text-neutral-200">
            Long-Term Memory
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            Append-only journal entries stored durably per character. This layer is for archive and lookup, not automatic prompt injection.
          </p>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-3">
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-1 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Storage
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            IndexedDB-backed durable local archive, intentionally separate from lightweight app preferences.
          </div>
        </div>
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-1 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Retrieval
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            MVP uses keyword search first. Semantic retrieval can replace or augment it later once embeddings exist.
          </div>
        </div>
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-1 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Constraint
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            Append-only in the first version. No delete, no edit, no record-management busywork.
          </div>
        </div>
      </div>
    </section>

    <section class="border border-neutral-200 rounded-2xl bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
      <div class="grid gap-4 xl:grid-cols-[1fr_1.3fr_auto]">
        <FieldSelect
          v-model="selectedCharacter"
          label="Character Filter"
          description="Default retrieval stays scoped to the selected character."
          :options="characterOptions"
        />
        <FieldInput
          v-model="searchTerm"
          label="Search"
          description="Keyword search over title, entry content, and character labels."
          placeholder="memory, continuity, rebuild..."
        />
        <div class="flex items-end">
          <Button
            label="Seed Entry"
            icon="i-solar:pen-new-square-bold-duotone"
            variant="secondary"
            @click="seedEntry"
          />
        </div>
      </div>
    </section>

    <div class="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <section class="border border-neutral-200 rounded-2xl bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
              Journal Archive
            </h3>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              Real stored entries for the selected character scope.
            </p>
          </div>
          <div class="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {{ visibleEntries.length }} results
          </div>
        </div>

        <div
          v-if="loading"
          class="border border-neutral-300 rounded-xl border-dashed bg-neutral-50/90 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-400"
        >
          Loading long-term journal entries...
        </div>

        <div
          v-else-if="visibleEntries.length === 0"
          class="border border-neutral-300 rounded-xl border-dashed bg-neutral-50/90 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-400"
        >
          No journal entries match this filter yet. Use the chat tool path or the seed button to create the first long-term memory entry.
        </div>

        <div v-else class="flex flex-col gap-3">
          <article
            v-for="entry in visibleEntries"
            :key="entry.id"
            class="border border-neutral-200 rounded-xl bg-neutral-50/90 p-4 dark:border-neutral-700 dark:bg-neutral-950/50"
          >
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <div class="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                  {{ entry.characterName }}
                </div>
                <div
                  :class="[
                    'rounded-full px-2.5 py-1 text-xs',
                    entry.source === 'tool'
                      ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                      : entry.source === 'seed'
                        ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                        : entry.source === 'proactivity'
                          ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
                          : 'bg-neutral-500/12 text-neutral-700 dark:text-neutral-300',
                  ]"
                >
                  {{ entry.source }}
                </div>
              </div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ formatTimestamp(entry.createdAt) }}
              </div>
            </div>

            <h4 class="mb-2 text-sm text-neutral-800 font-semibold dark:text-neutral-100">
              {{ entry.title }}
            </h4>
            <div class="whitespace-pre-wrap border border-neutral-300 rounded-lg border-dashed bg-white/70 p-3 text-sm text-neutral-700 leading-6 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
              {{ entry.content }}
            </div>
          </article>
        </div>
      </section>

      <section class="border border-neutral-200 rounded-2xl bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
        <h3 class="mb-3 text-lg text-neutral-800 font-semibold dark:text-neutral-100">
          Retrieval Notes
        </h3>

        <div class="border border-neutral-200 rounded-xl bg-neutral-50/90 p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            MVP Search Strategy
          </div>
          <p class="text-sm text-neutral-700 leading-6 dark:text-neutral-200">
            Keyword search is enough to make the archive useful now. Semantic retrieval can replace or augment it later without changing the overall product shape.
          </p>
        </div>

        <div class="mt-4 border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Why This Is Separate From Short-Term
          </div>
          <ul class="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-200">
            <li class="flex gap-2">
              <div class="i-solar:check-circle-bold-duotone mt-0.5 text-base text-emerald-500" />
              <span>Long-term is archive and lookup, not automatic session preload.</span>
            </li>
            <li class="flex gap-2">
              <div class="i-solar:check-circle-bold-duotone mt-0.5 text-base text-emerald-500" />
              <span>Entries stay raw and timestamped rather than being compacted into daily blocks.</span>
            </li>
            <li class="flex gap-2">
              <div class="i-solar:check-circle-bold-duotone mt-0.5 text-base text-emerald-500" />
              <span>Per-character filtering is required so different personas do not collapse into one archive.</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
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
