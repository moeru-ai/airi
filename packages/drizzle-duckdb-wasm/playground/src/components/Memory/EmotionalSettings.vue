<script setup lang="ts">
import { computed } from 'vue'

import Range from '../Range.vue'

const joyBoostFactor = defineModel<number>('joyBoostFactor', { default: 1.5 })
const joyDecaySteepness = defineModel<number>('joyDecaySteepness', { default: 3.0 })
const aversionSpikeFactor = defineModel<number>('aversionSpikeFactor', { default: 2.0 })
const aversionStability = defineModel<number>('aversionStability', { default: 1.2 })
const randomRecallProbability = defineModel<number>('randomRecallProbability', { default: 0.05 })
const flashbackIntensity = defineModel<number>('flashbackIntensity', { default: 2.0 })

// Computed percent values for display
const randomRecallPercent = computed(() => (randomRecallProbability.value * 100).toFixed(0))
</script>

<template>
  <div>
    <div class="my-4 rounded-lg bg-neutral-100 dark:bg-neutral-800/50">
      <h2 class="mb-2 text-lg font-semibold">
        Emotional Memory Parameters
      </h2>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <!-- Joy/Euphoria Settings -->
        <div class="flex flex-col gap-2">
          <label class="font-medium">Joy Boost Factor</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="joyBoostFactor"
              :min="0.1"
              :max="3.0"
              :step="0.1"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ joyBoostFactor.toFixed(1) }}x</span>
          </div>
          <div class="text-xs text-neutral-500">
            How much joy increases memory strength
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">Joy Decay Steepness</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="joyDecaySteepness"
              :min="0.5"
              :max="5.0"
              :step="0.1"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ joyDecaySteepness.toFixed(1) }}</span>
          </div>
          <div class="text-xs text-neutral-500">
            How quickly joy effect fades (higher = faster)
          </div>
        </div>

        <!-- Aversion/Trauma Settings -->
        <div class="flex flex-col gap-2">
          <label class="font-medium">Aversion Spike Factor</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="aversionSpikeFactor"
              :min="0.1"
              :max="5.0"
              :step="0.1"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ aversionSpikeFactor.toFixed(1) }}x</span>
          </div>
          <div class="text-xs text-neutral-500">
            How strongly aversive memories spike in recall
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">Aversion Stability</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="aversionStability"
              :min="1.0"
              :max="1.5"
              :step="0.05"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ aversionStability.toFixed(2) }}</span>
          </div>
          <div class="text-xs text-neutral-500">
            How persistent aversive memories become (PTSD-like)
          </div>
        </div>

        <!-- Random Recall/Flashback -->
        <div class="flex flex-col gap-2">
          <label class="font-medium">Random Recall Probability</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="randomRecallProbability"
              :min="0"
              :max="0.3"
              :step="0.01"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ randomRecallPercent }}%</span>
          </div>
          <div class="text-xs text-neutral-500">
            Chance of random memory flashbacks
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">Flashback Intensity</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="flashbackIntensity"
              :min="1.0"
              :max="5.0"
              :step="0.1"
              class="w-full"
            />
            <span class="w-16 text-right font-mono">{{ flashbackIntensity.toFixed(1) }}x</span>
          </div>
          <div class="text-xs text-neutral-500">
            How strong random memory flashbacks can be
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
