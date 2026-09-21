<script setup lang="ts">
import { useCorticoStore } from '@proj-airi/stage-ui/stores/cortico'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'

const corticoStore = useCorticoStore()
const { enabled: corticoEnabled, connected: corticoConnected, memory } = storeToRefs(corticoStore)

const sectionLabels: Record<string, string> = {
  'memo/active': 'Active memos',
  'memo/archived': 'Archived memos',
  'note': 'Notes',
  'note/playbook': 'Playbooks',
  'note/library': 'Library',
  'people': 'People',
}

const sections = computed(() =>
  (memory.value?.sections ?? []).map(s => ({
    ...s,
    label: sectionLabels[s.name] ?? s.name,
  })),
)

function refresh() {
  corticoStore.queryMemory()
}

onMounted(refresh)
watch(corticoConnected, (on) => {
  if (on)
    refresh()
})
</script>

<template>
  <div :class="['bg-neutral-50 dark:bg-[rgba(0,0,0,0.3)]', 'rounded-xl', 'p-4', 'flex flex-col gap-4']">
    <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
      Cortico Memory
    </h2>
    <p class="text-sm text-neutral-500 dark:text-neutral-400">
      The Cortico persona keeps one file-based memory workspace (memos, notes,
      playbooks, people). Short-term and long-term memory are unified here.
    </p>

    <div v-if="!corticoEnabled" class="text-sm text-amber-600">
      Cortico persona core is disabled. Enable it in Settings → Consciousness.
    </div>
    <div v-else-if="!corticoConnected" class="text-sm text-amber-600">
      Bridge not connected.
    </div>

    <template v-else>
      <div class="flex items-center justify-between">
        <div class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ memory ? `${memory.totalFiles} files` : 'Loading…' }}
        </div>
        <button
          class="rounded-lg bg-neutral-200 px-3 py-1 text-sm dark:bg-neutral-800"
          @click="refresh"
        >
          Refresh
        </button>
      </div>

      <div v-if="memory?.dir" class="truncate text-xs text-neutral-400 dark:text-neutral-500" :title="memory.dir">
        {{ memory.dir }}
      </div>

      <div v-for="section in sections" :key="section.name" class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between">
          <span class="text-sm font-medium">{{ section.label }}</span>
          <span class="text-xs text-neutral-400">{{ section.files }}</span>
        </div>
        <div v-if="section.recent.length" class="flex flex-col gap-0.5 pl-3">
          <div
            v-for="file in section.recent" :key="file"
            class="truncate text-xs text-neutral-500 dark:text-neutral-400"
          >
            {{ file }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
