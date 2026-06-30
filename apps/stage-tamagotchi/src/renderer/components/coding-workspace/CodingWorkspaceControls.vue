<script setup lang="ts">
import type { CodingMode, SpecEntryPath } from '@proj-airi/stage-ui/coding-workspace'

import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useTamagotchiCodingWorkspaceStore } from '../../stores/coding-workspace'

const codingWorkspaceStore = useTamagotchiCodingWorkspaceStore()
const {
  activeWorkspaceRoot,
  codingContextEnabled,
  codingMode,
  engine,
  mcpBackendState,
  serenaAvailable,
  specEntryPath,
} = storeToRefs(codingWorkspaceStore)

const codingModes = [
  { value: 'ask', label: 'Ask', icon: 'i-solar:question-circle-bold-duotone', title: 'Ask mode' },
  { value: 'spec', label: 'Spec', icon: 'i-solar:clipboard-list-bold-duotone', title: 'Spec mode' },
  { value: 'code', label: 'Code', icon: 'i-solar:code-square-bold-duotone', title: 'Code mode' },
  { value: 'debug', label: 'Debug', icon: 'i-solar:bug-bold-duotone', title: 'Debug mode' },
] as const satisfies readonly {
  value: CodingMode
  label: string
  icon: string
  title: string
}[]

const specEntryPaths = [
  { value: 'requirements-first', label: 'Requirements' },
  { value: 'design-first', label: 'Design' },
  { value: 'quick-spec', label: 'Quick spec' },
] as const satisfies readonly {
  value: SpecEntryPath
  label: string
}[]

const workspaceRootInput = computed({
  get: () => activeWorkspaceRoot.value ?? '',
  set: (value: string) => codingWorkspaceStore.setActiveWorkspaceRoot(value),
})

const selectedSpecEntryPath = computed({
  get: () => specEntryPath.value,
  set: (value: SpecEntryPath) => codingWorkspaceStore.setSpecEntryPath(value),
})

const backendLabel = computed(() => {
  if (serenaAvailable.value) {
    return 'Serena'
  }

  if (mcpBackendState.value === 'available') {
    return 'MCP'
  }

  return 'No MCP'
})

const backendIcon = computed(() => {
  if (serenaAvailable.value) {
    return 'i-solar:magic-stick-3-bold-duotone'
  }

  if (mcpBackendState.value === 'available') {
    return 'i-solar:server-square-bold-duotone'
  }

  return 'i-solar:plug-circle-bold-duotone'
})

const backendTone = computed(() => {
  if (serenaAvailable.value) {
    return 'border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200'
  }

  if (mcpBackendState.value === 'available') {
    return 'border-sky-300/50 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-200'
  }

  return 'border-neutral-300/60 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400'
})

function toggleCodingContext() {
  void codingWorkspaceStore.setCodingContextEnabled(!codingContextEnabled.value)
}

function setMode(mode: CodingMode) {
  codingWorkspaceStore.setCodingMode(mode)
}
</script>

<template>
  <div class="px-2 py-1">
    <div v-if="!codingContextEnabled" class="flex justify-end">
      <button
        class="h-8 inline-flex items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors transition-transform active:scale-95"
        bg="neutral-100 dark:neutral-800"
        text="neutral-500 dark:neutral-400"
        hover:text="primary-500 dark:primary-300"
        title="Enable coding context"
        aria-label="Enable coding context"
        @click="toggleCodingContext"
      >
        <div class="i-solar:code-square-bold-duotone text-base" />
        <span>Coding</span>
      </button>
    </div>

    <div
      v-else
      class="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1"
      border="primary-200/30 dark:primary-700/30"
      bg="white/70 dark:neutral-900/70"
    >
      <button
        class="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md outline-none transition-colors transition-transform active:scale-95"
        bg="primary-50 dark:primary-950/50"
        text="primary-600 dark:primary-200"
        hover:bg="primary-100 dark:primary-900/60"
        title="Disable coding context"
        aria-label="Disable coding context"
        @click="toggleCodingContext"
      >
        <div class="i-solar:code-square-bold-duotone text-base" />
      </button>

      <input
        v-model="workspaceRootInput"
        class="h-8 min-w-[140px] flex-1 rounded-md border px-2 text-xs outline-none transition-colors"
        border="neutral-200 dark:neutral-700 focus:primary-300 dark:focus:primary-500"
        bg="white dark:neutral-950"
        text="neutral-700 dark:neutral-100 placeholder:neutral-400"
        placeholder="Workspace root"
        aria-label="Workspace root"
      />

      <div class="h-8 inline-flex shrink-0 items-center gap-0.5 rounded-md p-0.5" bg="neutral-100 dark:neutral-800">
        <button
          v-for="mode in codingModes"
          :key="mode.value"
          class="h-7 inline-flex items-center gap-1 rounded px-2 text-xs outline-none transition-colors"
          :class="
            codingMode === mode.value
              ? 'bg-white text-primary-600 shadow-sm dark:bg-neutral-950 dark:text-primary-200'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100'
          "
          :title="mode.title"
          :aria-pressed="codingMode === mode.value"
          @click="setMode(mode.value)"
        >
          <div :class="[mode.icon, 'text-sm']" />
          <span>{{ mode.label }}</span>
        </button>
      </div>

      <select
        v-if="codingMode === 'spec'"
        v-model="selectedSpecEntryPath"
        class="h-8 rounded-md border px-2 text-xs outline-none"
        border="neutral-200 dark:neutral-700 focus:primary-300 dark:focus:primary-500"
        bg="white dark:neutral-950"
        text="neutral-700 dark:neutral-100"
        aria-label="Spec entry path"
      >
        <option v-for="entryPath in specEntryPaths" :key="entryPath.value" :value="entryPath.value">
          {{ entryPath.label }}
        </option>
      </select>

      <div
        class="h-8 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 text-xs"
        :class="backendTone"
        title="Coding MCP backend"
      >
        <div :class="[backendIcon, 'text-sm']" />
        <span>{{ backendLabel }}</span>
      </div>

      <div
        class="h-8 inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-300/60 bg-neutral-50 px-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300"
        title="Coding engine"
      >
        <div class="i-solar:cpu-bold-duotone text-sm" />
        <span>{{ engine }}</span>
      </div>
    </div>
  </div>
</template>
