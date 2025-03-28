<script setup lang="ts">
import { computed } from 'vue'

import Checkbox from '../Checkbox.vue'
import Range from '../Range.vue'

const longTermMemoryEnabled = defineModel<boolean>('longTermMemoryEnabled', { default: false })
const longTermMemoryThreshold = defineModel<number>('longTermMemoryThreshold', { default: 1 })
const longTermMemoryStability = defineModel<number>('longTermMemoryStability', { default: 0.5 })
const longTermMemoryVisualize = defineModel<boolean>('longTermMemoryVisualize', { default: false })
const retrievalBoost = defineModel<number>('retrievalBoost', { default: 0.5 })
const retrievalDecaySlowdown = defineModel<number>('retrievalDecaySlowdown', { default: 0.5 })
const decayRate = defineModel<number>('decayRate', { default: 0.01 })
const timeUnit = defineModel<string>('timeUnit', { default: 'days' })
const maxDaysToShow = defineModel<number>('maxDaysToShow', { default: 30 })

// Computed percent values for display
const retrievalBoostPercent = computed(() => (retrievalBoost.value * 100).toFixed(0))
const decaySlowdownPercent = computed(() => (retrievalDecaySlowdown.value * 100).toFixed(0))
</script>

<template>
  <div>
    <!-- Long-term Memory Model -->
    <div class="mb-4 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-800/50">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          Long-Term Memory Model
        </h2>
        <Checkbox v-model="longTermMemoryEnabled" />
      </div>

      <p class="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Configure how memories transition from short-term to permanent long-term memory with repeated retrievals
      </p>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="flex flex-col gap-2">
          <label class="font-medium">Retrieval Threshold</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="longTermMemoryThreshold"
              :min="1"
              :max="20"
              :step="1"
              class="w-full"
              :disabled="!longTermMemoryEnabled"
            />
            <span class="w-10 text-right font-mono">{{ longTermMemoryEnabled }}</span>
          </div>
          <div class="text-xs text-neutral-500">
            Retrievals needed to form stable long-term memory
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">Stability Factor</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="longTermMemoryStability"
              :min="0.01"
              :max="0.9"
              :step="0.01"
              class="w-full"
              :disabled="!longTermMemoryEnabled"
            />
            <span class="w-16 text-right font-mono">{{ longTermMemoryStability.toFixed(2) }}</span>
          </div>
          <div class="text-xs text-neutral-500">
            How quickly memories stabilize (lower = faster stabilization)
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">Memory Model Settings</label>
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-2">
              <Checkbox v-model="longTermMemoryVisualize" />
              <label for="ltmVisualize" class="text-sm">Show LTM projection</label>
            </div>
          </div>
          <div class="text-xs text-neutral-500">
            Options for memory visualization
          </div>
        </div>
      </div>
    </div>

    <!-- Retrieval Effect Settings -->
    <div class="mb-4 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-800/50">
      <h2 class="mb-2 text-lg font-semibold">
        Retrieval Effect Settings
      </h2>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-2">
          <label class="font-medium">Retrieval Boost Factor</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="retrievalBoost"
              :min="0"
              :max="1"
              :step="0.05"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ retrievalBoostPercent }}%</span>
          </div>
          <div class="text-xs text-neutral-500">
            How much each retrieval strengthens memory
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">Decay Slowdown Factor</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="retrievalDecaySlowdown"
              :min="0.1"
              :max="1"
              :step="0.05"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ decaySlowdownPercent }}%</span>
          </div>
          <div class="text-xs text-neutral-500">
            How much retrievals slow future decay (lower = more slowdown)
          </div>
        </div>
      </div>
    </div>

    <!-- General Decay Controls -->
    <div class="grid grid-cols-1 mb-4 gap-4 rounded-lg bg-neutral-100 p-4 md:grid-cols-3 dark:bg-neutral-800/50">
      <div class="flex flex-col gap-2">
        <label class="font-medium">Base Decay Rate</label>
        <div class="flex items-center gap-2">
          <Range
            v-model="decayRate"
            :min="0.01"
            :max="0.5"
            :step="0.01"
            class="w-full"
          />
          <span class="w-16 text-right font-mono">{{ decayRate.toFixed(4) }}</span>
        </div>
        <div class="text-xs text-neutral-500">
          Controls decay speed (0.0990 = ~10% per day)
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="font-medium">Time Unit</label>
        <select
          v-model="timeUnit"
          class="w-full rounded-lg border-none bg-neutral-100 p-2 outline-none dark:bg-neutral-700/30"
        >
          <option value="hours">
            Hours
          </option>
          <option value="days">
            Days
          </option>
          <option value="weeks">
            Weeks
          </option>
          <option value="months">
            Months
          </option>
        </select>
        <div class="text-xs text-neutral-500">
          Unit used in calculations (affects decay rate)
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="font-medium">Future Projection (Days)</label>
        <div class="flex items-center gap-2">
          <Range
            v-model="maxDaysToShow"
            :min="7"
            :max="90"
            :step="1"
            class="w-full"
          />
          <span class="w-16 text-right font-mono">{{ maxDaysToShow }}</span>
        </div>
        <div class="text-xs text-neutral-500">
          How many days to project into the future
        </div>
      </div>
    </div>
  </div>
</template>
