<script setup lang="ts">
import { useModelStore } from '@proj-airi/stage-ui-three'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { Container } from '../../../data-pane'

const modelStore = useModelStore()
const { availableExpressions, activeExpressions } = storeToRefs(modelStore)

// Categorize: Presets have mixed case (e.g., "happy", "MouthLeft"), Custom are all lowercase
const presets = computed(() =>
  availableExpressions.value.filter(e => e !== e.toLowerCase()),
)
const custom = computed(() =>
  availableExpressions.value.filter(e => e === e.toLowerCase()),
)

const hasExpressions = computed(() => availableExpressions.value.length > 0)

function toggleExpression(name: string) {
  const current = activeExpressions.value[name] || 0
  const next = current > 0 ? 0 : 1
  activeExpressions.value = { ...activeExpressions.value, [name]: next }
}

function resetAll() {
  const reset: Record<string, number> = {}
  for (const name of availableExpressions.value) {
    reset[name] = 0
  }
  activeExpressions.value = reset
}

function isActive(name: string): boolean {
  return (activeExpressions.value[name] || 0) > 0
}
</script>

<template>
  <Container
    title="Expressions"
    icon="i-solar:emoji-funny-square-bold-duotone"
    :expand="false"
    :class="[
      'rounded-xl',
      'bg-white/80 dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <div v-if="!hasExpressions" class="p-2 text-xs text-neutral-400">
      No expressions available. Load a VRM model first.
    </div>
    <template v-else>
      <div class="flex items-center justify-between px-2 pt-1">
        <span class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ availableExpressions.length }} expressions
        </span>
        <button
          class="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 transition-colors dark:bg-neutral-800 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700"
          @click="resetAll"
        >
          Reset All
        </button>
      </div>

      <!-- Presets -->
      <div v-if="presets.length > 0" class="px-2 pt-2">
        <div class="mb-1 text-xs text-neutral-500 font-medium dark:text-neutral-400">
          Presets ({{ presets.length }})
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="name in presets"
            :key="name"
            :class="[
              'rounded-md px-2 py-1 text-xs transition-all duration-150',
              'border border-solid',
              isActive(name)
                ? 'bg-primary-500/20 border-primary-400 text-primary-600 dark:text-primary-300 font-medium'
                : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700',
            ]"
            @click="toggleExpression(name)"
          >
            {{ name }}
          </button>
        </div>
      </div>

      <!-- Custom Extensions -->
      <div v-if="custom.length > 0" class="px-2 py-2">
        <div class="mb-1 text-xs text-neutral-500 font-medium dark:text-neutral-400">
          Custom Extensions ({{ custom.length }})
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="name in custom"
            :key="name"
            :class="[
              'rounded-md px-2 py-1 text-xs transition-all duration-150',
              'border border-solid',
              isActive(name)
                ? 'bg-lime-500/20 border-lime-400 text-lime-600 dark:text-lime-300 font-medium'
                : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700',
            ]"
            @click="toggleExpression(name)"
          >
            {{ name }}
          </button>
        </div>
      </div>
    </template>
  </Container>
</template>
