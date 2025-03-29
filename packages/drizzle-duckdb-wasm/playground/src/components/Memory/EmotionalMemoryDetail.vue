<script setup lang="ts">
import type { EmotionalMemoryItem } from '../../types/memory/emotional-memory'

import { computed } from 'vue'

const props = defineProps<{
  memory: EmotionalMemoryItem
  longTermThreshold: number
  muscleMemoryThreshold: number
}>()

const emit = defineEmits(['retrieve'])

// Calculate age in days
const ageInDays = computed(() => {
  return Math.round(props.memory.age_in_seconds / (24 * 60 * 60))
})

// Calculate time since last retrieval
const daysSinceRetrieved = computed(() => {
  return Math.round(props.memory.time_since_retrieval / (24 * 60 * 60))
})

// Calculate memory status
const memoryStatus = computed(() => {
  if (props.memory.retrieval_count >= props.muscleMemoryThreshold) {
    return {
      type: 'muscle-memory',
      label: 'Muscle Memory',
      color: 'text-purple-600 dark:text-purple-400',
    }
  }
  else if (props.memory.retrieval_count >= props.longTermThreshold) {
    return {
      type: 'long-term',
      label: 'Long-term Memory',
      color: 'text-indigo-600 dark:text-indigo-400',
    }
  }
  else if (props.memory.retrieval_count > 0) {
    return {
      type: 'working',
      label: 'Working Memory',
      color: 'text-blue-600 dark:text-blue-400',
    }
  }
  else {
    return {
      type: 'short-term',
      label: 'Short-term Memory',
      color: 'text-red-600 dark:text-red-400',
    }
  }
})

// Joy and aversion levels as percentage
const joyPercentage = computed(() => {
  return Math.round(props.memory.joy_score * 100)
})

const aversionPercentage = computed(() => {
  return Math.round(props.memory.aversion_score * 100)
})

// Progress percentage for memory strength
const strengthPercentage = computed(() => {
  return Math.min(100, Math.round((props.memory.decayed_score / props.memory.score) * 100))
})

// Progress towards long-term memory
const ltmPercentage = computed(() => {
  if (props.memory.retrieval_count >= props.longTermThreshold) {
    return 100
  }
  return Math.round((props.memory.retrieval_count / props.longTermThreshold) * 100)
})

// Progress towards muscle memory
const musclePercentage = computed(() => {
  if (props.memory.retrieval_count >= props.muscleMemoryThreshold) {
    return 100
  }
  if (props.memory.retrieval_count < props.longTermThreshold) {
    return 0
  }
  return Math.round(((props.memory.retrieval_count - props.longTermThreshold)
    / (props.muscleMemoryThreshold - props.longTermThreshold)) * 100)
})

// Emotional effect on memory score
const emotionalMultiplier = computed(() => {
  // This is a simplified calculation - would match your SQL formula
  const joyEffect = props.memory.joy_score > 0 ? props.memory.joy_score : 0
  const aversionEffect = props.memory.aversion_score > 0 ? props.memory.aversion_score : 0
  const combined = 1 + joyEffect + aversionEffect
  return Math.round(combined * 100)
})

function simulateRetrieval(emotionalResponse = null) {
  if (emotionalResponse === 'joy') {
    emit('retrieve', props.memory.id, { joyModifier: 0.1, aversionModifier: -0.05 })
  }
  else if (emotionalResponse === 'aversion') {
    emit('retrieve', props.memory.id, { joyModifier: -0.05, aversionModifier: 0.1 })
  }
  else if (emotionalResponse === 'neutral') {
    emit('retrieve', props.memory.id, { joyModifier: 0, aversionModifier: 0 })
  }
  else if (emotionalResponse === 'strong-joy') {
    emit('retrieve', props.memory.id, { joyModifier: 0.2, aversionModifier: -0.1 })
  }
  else if (emotionalResponse === 'strong-aversion') {
    emit('retrieve', props.memory.id, { joyModifier: -0.1, aversionModifier: 0.2 })
  }
}
</script>

<template>
  <div class="flex flex-col justify-between rounded-lg bg-white p-4 shadow dark:bg-neutral-800/50">
    <div class="mb-4 flex justify-between">
      <h3 class="text-xl font-bold">
        {{ memory.id }}
      </h3>
      <span
        class="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium"
        :class="{
          'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300': memoryStatus.type === 'muscle-memory',
          'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300': memoryStatus.type === 'long-term',
          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300': memoryStatus.type === 'working',
          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300': memoryStatus.type === 'short-term',
        }"
      >
        {{ memoryStatus.label }}
      </span>
    </div>

    <div class="grid grid-cols-2 mb-4 gap-3 text-sm font-mono">
      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Base Score:
      </div>
      <div class="text-right font-medium">
        {{ Math.round(memory.score) }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Current Score:
      </div>
      <div class="text-right font-medium">
        {{ Math.round(memory.decayed_score) }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Emotional Effect:
      </div>
      <div class="text-right font-medium">
        {{ emotionalMultiplier }}%
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Retrieval Count:
      </div>
      <div class="text-right font-medium">
        {{ memory.retrieval_count }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Memory Age:
      </div>
      <div class="text-right font-medium">
        {{ ageInDays }} days
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Last Retrieved:
      </div>
      <div class="text-right font-medium">
        {{ daysSinceRetrieved > 0 ? `${daysSinceRetrieved} days ago` : 'Today' }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Joy Score:
      </div>
      <div
        class="text-right font-medium"
        :class="joyPercentage > 50 ? 'text-yellow-500 dark:text-yellow-400' : ''"
      >
        {{ joyPercentage }}%
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Aversion Score:
      </div>
      <div
        class="text-right font-medium"
        :class="aversionPercentage > 50 ? 'text-red-500 dark:text-red-400' : ''"
      >
        {{ aversionPercentage }}%
      </div>
    </div>

    <!-- Emotional retrieval buttons -->
    <div class="mb-6">
      <h4 class="mb-2 text-sm text-neutral-500 font-medium dark:text-neutral-400">
        Simulate Retrieval with Emotion:
      </h4>
      <div class="grid grid-cols-3 gap-2">
        <button
          class="rounded-lg bg-yellow-100 px-3 py-2 text-sm font-medium dark:bg-yellow-900/50 hover:bg-yellow-200 dark:hover:bg-yellow-900"
          @click="simulateRetrieval('strong-joy')"
        >
          Very Joyful
        </button>
        <button
          class="rounded-lg bg-yellow-50 px-3 py-2 text-sm font-medium dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
          @click="simulateRetrieval('joy')"
        >
          Mild Joy
        </button>
        <button
          class="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          @click="simulateRetrieval('neutral')"
        >
          Neutral
        </button>
        <button
          class="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40"
          @click="simulateRetrieval('aversion')"
        >
          Mild Aversion
        </button>
        <button
          class="rounded-lg bg-red-100 px-3 py-2 text-sm font-medium dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900"
          @click="simulateRetrieval('strong-aversion')"
        >
          Strong Aversion
        </button>
      </div>
    </div>

    <!-- Visual representation of memory state -->
    <div>
      <!-- Memory Strength Progress -->
      <div class="mt-4 font-mono">
        <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Current Memory Strength:
        </div>
        <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
          <div
            class="h-full max-w-full transition-all duration-500"
            :class="{
              'bg-purple-400': memoryStatus.type === 'muscle-memory',
              'bg-indigo-500': memoryStatus.type === 'long-term',
              'bg-blue-500': memoryStatus.type === 'working',
              'bg-red-500': memoryStatus.type === 'short-term',
            }"
            :style="`width: ${strengthPercentage}%`"
          />
        </div>
        <div class="mt-1 flex justify-between text-xs">
          <span>0%</span>
          <span>{{ Math.round(memory.score / 2) }}</span>
          <span>{{ Math.round(memory.score) }}</span>
        </div>
      </div>

      <!-- Memory Formation Progress -->
      <div class="mt-4 font-mono">
        <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Long-term Memory Progress:
        </div>
        <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
          <div
            class="h-full max-w-full bg-indigo-400 transition-all duration-500"
            :style="`width: ${ltmPercentage}%`"
          />
        </div>
        <div class="mt-1 flex items-center justify-between text-xs">
          <span>Working</span>
          <span v-if="memory.retrieval_count < longTermThreshold" class="text-sm font-medium">
            {{ memory.retrieval_count }}/{{ longTermThreshold }} retrievals
          </span>
          <span v-else class="text-sm text-indigo-600 font-medium dark:text-indigo-400">
            LTM Stabled
          </span>
          <span>Long-term</span>
        </div>
      </div>

      <!-- Muscle Memory Progress -->
      <div class="mt-4 font-mono">
        <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Muscle Memory Progress:
        </div>
        <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
          <div
            class="h-full max-w-full bg-purple-400 transition-all duration-500"
            :style="`width: ${musclePercentage}%`"
          />
        </div>
        <div class="mt-1 flex items-center justify-between text-xs">
          <span>Conscious</span>
          <span v-if="memory.retrieval_count < muscleMemoryThreshold" class="text-sm font-medium">
            {{ memory.retrieval_count }}/{{ muscleMemoryThreshold }} retrievals
          </span>
          <span v-else class="text-sm text-purple-600 font-medium dark:text-purple-400">
            MM formed
          </span>
          <span>Automatic</span>
        </div>
      </div>

      <!-- Emotional Components -->
      <div class="grid grid-cols-2 mt-4 gap-4">
        <div>
          <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
            Joy Factor:
          </div>
          <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
            <div
              class="h-full max-w-full bg-yellow-400 transition-all duration-500"
              :style="`width: ${joyPercentage}%`"
            />
          </div>
        </div>
        <div>
          <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
            Aversion Factor:
          </div>
          <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
            <div
              class="h-full max-w-full bg-red-400 transition-all duration-500"
              :style="`width: ${aversionPercentage}%`"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
