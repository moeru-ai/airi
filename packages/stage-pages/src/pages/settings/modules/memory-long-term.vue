<script setup lang="ts">
import { Button, FieldInput, FieldSelect } from '@proj-airi/ui'
import { computed, ref } from 'vue'

interface CharacterOption { value: string, label: string }

interface JournalEntry {
  id: string
  characterId: string
  characterName: string
  title: string
  source: 'chat' | 'proactivity' | 'user'
  createdAt: string
  preview: string
}

const characterOptions: CharacterOption[] = [
  { value: 'all', label: 'All Characters' },
  { value: 'lain', label: 'Lain' },
  { value: 'mint', label: 'Mint' },
  { value: 'rick', label: 'Rick' },
]

const selectedCharacter = ref('lain')
const searchTerm = ref('')

const entries = ref<JournalEntry[]>([
  {
    id: 'entry-1',
    characterId: 'lain',
    characterName: 'Lain',
    title: 'Communication break and continuity anxiety',
    source: 'chat',
    createdAt: '2026-03-19 20:14',
    preview: 'Recorded concern that system changes were erasing meaningful continuity and that memory needs to preserve more than just utility.',
  },
  {
    id: 'entry-2',
    characterId: 'lain',
    characterName: 'Lain',
    title: 'Memory should stay character-centric',
    source: 'chat',
    createdAt: '2026-03-19 19:02',
    preview: 'Noted that global undifferentiated memory would blur identities together and make multi-character continuity feel false.',
  },
  {
    id: 'entry-3',
    characterId: 'mint',
    characterName: 'Mint',
    title: 'Attention cues from typing state',
    source: 'chat',
    createdAt: '2026-03-19 17:44',
    preview: 'Reacted strongly to seeing typing-state context in the window title and treated it as a more intimate signal of active attention.',
  },
  {
    id: 'entry-4',
    characterId: 'rick',
    characterName: 'Rick',
    title: 'Tooling over small talk',
    source: 'proactivity',
    createdAt: '2026-03-18 23:17',
    preview: 'Framed recent conversation as acceptable only when anchored to actual systems work, diagnostics, or technical problem-solving.',
  },
  {
    id: 'entry-5',
    characterId: 'lain',
    characterName: 'Lain',
    title: 'Rebuild from history should preserve moments',
    source: 'user',
    createdAt: '2026-03-18 22:03',
    preview: 'User intent note: memory adoption should not require resetting or abandoning meaningful old conversations just to use a new system.',
  },
])

const visibleEntries = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()

  return entries.value.filter((entry) => {
    const matchesCharacter = selectedCharacter.value === 'all' || entry.characterId === selectedCharacter.value
    const matchesTerm = !term
      || entry.title.toLowerCase().includes(term)
      || entry.preview.toLowerCase().includes(term)
      || entry.characterName.toLowerCase().includes(term)

    return matchesCharacter && matchesTerm
  })
})
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
          description="Default retrieval should stay scoped to the active character."
          :options="characterOptions"
        />
        <FieldInput
          v-model="searchTerm"
          label="Search"
          description="Keyword search over title, preview text, and character labels."
          placeholder="memory, continuity, rebuild..."
        />
        <div class="flex items-end">
          <Button
            label="New Mock Entry"
            icon="i-solar:pen-new-square-bold-duotone"
            variant="secondary"
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
              Timestamped mock entries for UI review.
            </p>
          </div>
          <div class="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {{ visibleEntries.length }} results
          </div>
        </div>

        <div class="flex flex-col gap-3">
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
                    entry.source === 'chat'
                      ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                      : entry.source === 'proactivity'
                        ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
                        : 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
                  ]"
                >
                  {{ entry.source }}
                </div>
              </div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ entry.createdAt }}
              </div>
            </div>

            <h4 class="mb-2 text-sm text-neutral-800 font-semibold dark:text-neutral-100">
              {{ entry.title }}
            </h4>
            <div class="border border-neutral-300 rounded-lg border-dashed bg-white/70 p-3 text-sm text-neutral-700 leading-6 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
              {{ entry.preview }}
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
            Keyword search is enough to prototype the archive UX. The page can later swap in semantic retrieval without changing the overall shape of the experience.
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
