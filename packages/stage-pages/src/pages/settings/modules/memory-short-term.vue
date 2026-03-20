<script setup lang="ts">
import { useAiriCardStore, useShortTermMemoryStore } from '@proj-airi/stage-ui/stores'
import { Button, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

interface CharacterOption { value: string, label: string }

const cardStore = useAiriCardStore()
const shortTermMemory = useShortTermMemoryStore()

const { cards } = storeToRefs(cardStore)
const { activeCardId, loading, rebuilding, rebuildProgress, error } = storeToRefs(shortTermMemory)

const selectedCharacter = ref('')
const windowSize = ref(3)
const tokensPerDay = ref(1000)

const characterOptions = computed<CharacterOption[]>(() => {
  return Array.from(cards.value.entries()).map(([id, card]) => ({
    value: id,
    label: card.nickname?.trim() ? `${card.name} (${card.nickname.trim()})` : card.name,
  }))
})

const visibleBlocks = computed(() => {
  return selectedCharacter.value
    ? shortTermMemory.getCharacterBlocks(selectedCharacter.value)
    : []
})

const selectedCharacterLabel = computed(() => {
  return characterOptions.value.find(option => option.value === selectedCharacter.value)?.label ?? 'Unknown Character'
})

async function rebuildFromHistory() {
  if (!selectedCharacter.value)
    return

  try {
    const result = await shortTermMemory.rebuildFromHistory(selectedCharacter.value, {
      tokenBudgetPerDay: tokensPerDay.value,
    })

    toast.success(`Short-term rebuild complete. Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.`)
  }
  catch (rebuildError) {
    const message = rebuildError instanceof Error ? rebuildError.message : String(rebuildError)
    toast.error(`Short-term rebuild failed: ${message}`)
  }
}

onMounted(async () => {
  cardStore.initialize()
  await shortTermMemory.load()

  if (!selectedCharacter.value) {
    selectedCharacter.value = activeCardId.value || characterOptions.value[0]?.value || ''
  }
})

watch(characterOptions, (options) => {
  if (!selectedCharacter.value || !options.some(option => option.value === selectedCharacter.value)) {
    selectedCharacter.value = activeCardId.value || options[0]?.value || ''
  }
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="border border-neutral-200 rounded-2xl bg-neutral-100/90 p-5 dark:border-neutral-700 dark:bg-[rgba(0,0,0,0.26)]">
      <div class="mb-4 flex items-start gap-3">
        <div class="i-solar:alarm-bold-duotone text-2xl text-cyan-500" />
        <div>
          <h2 class="text-lg text-neutral-700 md:text-2xl dark:text-neutral-200">
            Short-Term Memory
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            Daily summary blocks derived from chat history. These are designed to preload recent continuity into the prompt without dragging entire conversation logs into every new session.
          </p>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-3">
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-1 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Source
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            Rebuilds summarize the selected character's chat history first. Journal-aware short-term memory comes later.
          </div>
        </div>
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-1 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Injection
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            The latest blocks are automatically loaded as hidden context for the active character.
          </div>
        </div>
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-1 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Current State
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            Rebuild from history is live. Automatic post-midnight generation is still the next step.
          </div>
        </div>
      </div>
    </section>

    <section class="border border-neutral-200 rounded-2xl bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
      <div class="grid gap-4 xl:grid-cols-[1.3fr_1fr_auto]">
        <FieldSelect
          v-model="selectedCharacter"
          label="Active Character"
          description="Short-term blocks are always scoped to the selected character."
          :options="characterOptions"
        />
        <FieldInput
          v-model="windowSize"
          label="Window Size"
          description="How many recent daily blocks are kept ready for prompt injection."
          type="number"
        />
        <FieldInput
          v-model="tokensPerDay"
          label="Token Budget Per Day"
          description="Target size hint for summarization. Exact token control is provider-specific and not guaranteed yet."
          type="number"
        />
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Button
          label="Rebuild From History"
          icon="i-solar:restart-bold-duotone"
          variant="secondary"
          :disabled="!selectedCharacter || rebuilding"
          @click="rebuildFromHistory"
        />
        <Button
          label="Generate Yesterday's Block"
          icon="i-solar:moon-stars-bold-duotone"
          variant="secondary-muted"
          disabled
        />
        <div
          v-if="rebuilding"
          class="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-700 dark:text-cyan-300"
        >
          {{ rebuildProgress || 'Rebuilding short-term memory...' }}
        </div>
        <div
          v-else
          class="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          Automatic daily generation will be added next.
        </div>
      </div>

      <div
        v-if="error"
        class="mt-4 border border-red-200 rounded-xl bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
      >
        {{ error }}
      </div>
    </section>

    <div class="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <section class="border border-neutral-200 rounded-2xl bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
              Daily Summary Blocks
            </h3>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              Reverse-chronological summaries for <span class="text-neutral-700 font-medium dark:text-neutral-200">{{ selectedCharacterLabel }}</span>.
            </p>
          </div>
          <div class="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {{ visibleBlocks.length }} stored blocks
          </div>
        </div>

        <div
          v-if="loading"
          class="border border-neutral-300 rounded-xl border-dashed bg-neutral-50/90 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-400"
        >
          Loading short-term memory blocks...
        </div>

        <div
          v-else-if="visibleBlocks.length === 0"
          class="border border-neutral-300 rounded-xl border-dashed bg-neutral-50/90 p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-400"
        >
          No short-term memory blocks exist for this character yet. Run <span class="text-neutral-700 font-medium dark:text-neutral-200">Rebuild From History</span> to distill existing chat logs into daily continuity blocks.
        </div>

        <div v-else class="flex flex-col gap-3">
          <article
            v-for="block in visibleBlocks"
            :key="block.id"
            class="border border-neutral-200 rounded-xl bg-neutral-50/90 p-4 dark:border-neutral-700 dark:bg-neutral-950/50"
          >
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <div class="rounded-full bg-cyan-500/12 px-2.5 py-1 text-xs text-cyan-700 dark:text-cyan-300">
                  {{ block.date }}
                </div>
                <div
                  :class="[
                    'rounded-full px-2.5 py-1 text-xs',
                    block.source === 'automatic'
                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
                  ]"
                >
                  {{ block.source === 'automatic' ? 'Post-midnight generated' : 'Rebuilt from history' }}
                </div>
              </div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400">
                ~{{ block.estimatedTokens }} tokens | {{ block.messageCount }} messages | {{ block.sessionCount }} sessions
              </div>
            </div>

            <div class="whitespace-pre-wrap border border-neutral-300 rounded-lg border-dashed bg-white/70 p-3 text-sm text-neutral-700 leading-6 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
              {{ block.summary }}
            </div>
          </article>
        </div>
      </section>

      <section class="border border-neutral-200 rounded-2xl bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
        <h3 class="mb-3 text-lg text-neutral-800 font-semibold dark:text-neutral-100">
          Context Injection Preview
        </h3>
        <div class="border border-neutral-200 rounded-xl bg-neutral-50/90 p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Hidden Session Context
          </div>
          <div class="text-sm text-neutral-700 leading-6 dark:text-neutral-200">
            The latest <span class="font-semibold">{{ windowSize }}</span> daily blocks would be compacted and injected for <span class="font-semibold">{{ selectedCharacterLabel }}</span>, respecting a per-day target of roughly <span class="font-semibold">{{ tokensPerDay }}</span> tokens.
          </div>
        </div>

        <div class="mt-4 border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Design Notes
          </div>
          <ul class="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-200">
            <li class="flex gap-2">
              <div class="i-solar:check-circle-bold-duotone mt-0.5 text-base text-cyan-500" />
              <span>One block per day keeps recent context stable and predictable.</span>
            </li>
            <li class="flex gap-2">
              <div class="i-solar:check-circle-bold-duotone mt-0.5 text-base text-cyan-500" />
              <span>Rebuild uses the selected character's identity fields and post-history instructions to guide summary generation.</span>
            </li>
            <li class="flex gap-2">
              <div class="i-solar:check-circle-bold-duotone mt-0.5 text-base text-cyan-500" />
              <span>Everything remains per-character to avoid identity bleed across personas.</span>
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
  titleKey: settings.pages.modules.memory-short-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
