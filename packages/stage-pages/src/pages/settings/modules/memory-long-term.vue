<script setup lang="ts">
import { RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useMemoryBrowser } from '@proj-airi/stage-ui/composables'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'

const providersStore = useProvidersStore()
const memoryStore = useMemoryStore()

const { persistedChatProvidersMetadata, configuredProviders } = storeToRefs(providersStore)
const {
  enabled,
  embedProvider,
  embedModel,
  configured,
  topK,
  simThreshold,
  recencyHalfLifeDays,
  writeEveryNTurns,
  mergeThreshold,
} = storeToRefs(memoryStore)

const { memories, loading, refresh, remove, clearAll } = useMemoryBrowser()

onMounted(refresh)

function handleDeleteProvider(providerId: string) {
  if (embedProvider.value === providerId)
    embedProvider.value = ''

  providersStore.deleteProvider(providerId)
}
</script>

<template>
  <div :class="['bg-neutral-50 dark:bg-[rgba(0,0,0,0.3)]', 'rounded-xl p-4', 'flex flex-col gap-6']">
    <!-- Enable -->
    <div :class="['flex flex-col gap-3']">
      <div>
        <h2 :class="['text-lg md:text-2xl', 'text-neutral-500 dark:text-neutral-400']">
          Long-term memory
        </h2>
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          AIRI forms memories from your conversations and recalls the relevant ones each turn.
          Requires an embedding provider (e.g. Ollama serving <code>bge-m3</code>).
        </div>
      </div>
      <FieldCheckbox
        v-model="enabled"
        label="Enable long-term memory"
        description="When on, recall runs every turn and new memories are formed every few turns."
      />
      <div
        v-if="enabled && !configured"
        :class="['flex items-center gap-2', 'rounded-lg p-3', 'bg-amber-50 dark:bg-amber-900/20', 'text-amber-700 dark:text-amber-300 text-sm']"
      >
        <div i-solar:warning-circle-line-duotone class="text-lg" />
        <span>Pick an embedding provider and model below — memory stays idle until then.</span>
      </div>
    </div>

    <!-- Embedding provider -->
    <div :class="['flex flex-col gap-4']">
      <div>
        <h2 :class="['text-lg md:text-2xl', 'text-neutral-500 dark:text-neutral-400']">
          Embedding provider
        </h2>
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          The provider used to turn memories into vectors. Use a provider pointing at your embeddings
          endpoint (Ollama / OpenAI-compatible).
        </div>
      </div>

      <fieldset
        v-if="persistedChatProvidersMetadata.length > 0"
        :class="['flex flex-row gap-4', 'min-w-0 of-x-auto scroll-smooth']"
        role="radiogroup"
      >
        <RadioCardSimple
          v-for="metadata in persistedChatProvidersMetadata"
          :id="metadata.id"
          :key="metadata.id"
          v-model="embedProvider"
          name="memory-embed-provider"
          :value="metadata.id"
          :title="metadata.localizedName || 'Unknown'"
          :description="metadata.localizedDescription"
        >
          <template v-if="!metadata.id.startsWith('official-provider')" #topRight>
            <button
              type="button"
              :class="['rounded p-1', 'bg-neutral-100 dark:bg-neutral-800/60', 'text-neutral-600 dark:text-neutral-300', 'transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/60']"
              @click.stop.prevent="handleDeleteProvider(metadata.id)"
            >
              <div i-solar:trash-bin-trash-bold-duotone class="text-base" />
            </button>
          </template>
          <template v-if="configuredProviders[metadata.id] === false" #bottomRight>
            <div :class="['rounded px-2 py-0.5', 'bg-amber-100 dark:bg-amber-900/30', 'text-amber-700 dark:text-amber-300 text-xs font-medium']">
              Health check failed
            </div>
          </template>
        </RadioCardSimple>
        <RouterLink
          to="/settings/providers"
          border="2px solid"
          :class="['border-neutral-100 dark:border-neutral-900 hover:border-primary-500/30 dark:hover:border-primary-400/30', 'bg-white dark:bg-neutral-900/20', 'flex flex-col items-center justify-center', 'relative min-w-50 w-fit rounded-xl p-4', 'transition-all duration-200 ease-in-out']"
        >
          <div i-solar:add-circle-line-duotone class="text-2xl text-neutral-500 dark:text-neutral-500" />
        </RouterLink>
      </fieldset>
      <RouterLink
        v-else
        :class="['flex items-center gap-3 rounded-lg p-4']"
        border="2 dashed neutral-200 dark:neutral-800"
        bg="neutral-50 dark:neutral-800"
        to="/settings/providers"
      >
        <div i-solar:warning-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
        <div :class="['flex flex-col']">
          <span class="font-medium">No providers configured</span>
          <span class="text-sm text-neutral-400 dark:text-neutral-500">Add an Ollama or OpenAI-compatible provider first.</span>
        </div>
        <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
      </RouterLink>

      <div v-if="embedProvider">
        <label :class="['mb-1 block text-sm font-medium']">Embedding model</label>
        <input
          v-model="embedModel"
          type="text"
          :class="['w-full rounded px-3 py-2', 'border border-neutral-300 dark:border-neutral-700', 'bg-white dark:bg-neutral-900']"
          placeholder="bge-m3"
        >
      </div>
    </div>

    <!-- Recall tuning -->
    <div :class="['flex flex-col gap-4']">
      <div>
        <h2 :class="['text-lg md:text-2xl', 'text-neutral-500 dark:text-neutral-400']">
          Recall
        </h2>
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          How memories are retrieved each turn.
        </div>
      </div>
      <FieldRange
        v-model="topK"
        label="Memories per turn"
        description="Maximum memories pulled before re-ranking."
        :min="1" :max="12" :step="1"
      />
      <FieldRange
        v-model="simThreshold"
        label="Similarity threshold"
        description="Minimum cosine similarity to recall a memory. Higher = stricter (fewer, more relevant)."
        :min="0" :max="1" :step="0.05"
        :format-value="v => v.toFixed(2)"
      />
      <FieldRange
        v-model="recencyHalfLifeDays"
        label="Recency half-life"
        description="How fast a memory's recency weight decays when re-ranking."
        :min="1" :max="180" :step="1"
        :format-value="v => `${v}d`"
      />
    </div>

    <!-- Write tuning -->
    <div :class="['flex flex-col gap-4']">
      <div>
        <h2 :class="['text-lg md:text-2xl', 'text-neutral-500 dark:text-neutral-400']">
          Formation
        </h2>
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          How memories are formed from conversation.
        </div>
      </div>
      <FieldRange
        v-model="writeEveryNTurns"
        label="Extract every N turns"
        description="Run memory extraction this often (a backbone LLM call)."
        :min="4" :max="40" :step="1"
      />
      <FieldRange
        v-model="mergeThreshold"
        label="Merge threshold"
        description="Above this similarity a new fact reinforces an existing memory instead of adding a duplicate."
        :min="0.5" :max="1" :step="0.01"
        :format-value="v => v.toFixed(2)"
      />
    </div>

    <!-- Memory browser -->
    <div :class="['flex flex-col gap-3']">
      <div :class="['flex items-center justify-between']">
        <div>
          <h2 :class="['text-lg md:text-2xl', 'text-neutral-500 dark:text-neutral-400']">
            Stored memories
          </h2>
          <div :class="['text-neutral-400 dark:text-neutral-500']">
            {{ memories.length }} for this character.
          </div>
        </div>
        <div :class="['flex items-center gap-2']">
          <button
            type="button"
            :class="['rounded-lg px-3 py-1.5 text-sm', 'bg-neutral-100 dark:bg-neutral-800', 'hover:bg-neutral-200 dark:hover:bg-neutral-700']"
            @click="refresh"
          >
            Refresh
          </button>
          <button
            v-if="memories.length > 0"
            type="button"
            :class="['rounded-lg px-3 py-1.5 text-sm', 'bg-red-100 dark:bg-red-900/30', 'text-red-700 dark:text-red-300', 'hover:bg-red-200 dark:hover:bg-red-900/50']"
            @click="clearAll"
          >
            Clear all
          </button>
        </div>
      </div>

      <div v-if="loading" :class="['text-sm text-neutral-400']">
        Loading…
      </div>
      <div v-else-if="memories.length === 0" :class="['text-sm text-neutral-400 dark:text-neutral-500']">
        No memories yet. They form automatically as you chat (with memory enabled and configured).
      </div>
      <ul v-else :class="['flex flex-col gap-2']">
        <li
          v-for="memory in memories"
          :key="memory.id"
          :class="['flex items-start gap-3', 'rounded-lg p-3', 'bg-white dark:bg-neutral-900/40', 'border border-neutral-100 dark:border-neutral-800']"
        >
          <div :class="['flex flex-col gap-1 flex-1 min-w-0']">
            <span :class="['text-sm text-neutral-700 dark:text-neutral-200', 'break-words']">{{ memory.text }}</span>
            <div :class="['flex items-center gap-2 text-xs text-neutral-400']">
              <span :class="['rounded px-1.5 py-0.5', 'bg-neutral-100 dark:bg-neutral-800']">{{ memory.type }}</span>
              <span>salience {{ memory.salience }}</span>
            </div>
          </div>
          <button
            type="button"
            :class="['rounded p-1 shrink-0', 'text-neutral-400 hover:text-red-500', 'transition-colors']"
            title="Delete memory"
            @click="remove(memory.id)"
          >
            <div i-solar:trash-bin-trash-bold-duotone class="text-base" />
          </button>
        </li>
      </ul>
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
