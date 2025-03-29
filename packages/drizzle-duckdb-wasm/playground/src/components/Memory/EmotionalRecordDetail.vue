<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  memory: any
  longTermMemoryThreshold: number
  muscleMemoryThreshold: number
}>()

const emit = defineEmits(['retrieve'])

// Joy and aversion values
const joyLevel = computed(() => {
  return props.memory.joy_score || 0
})

const aversionLevel = computed(() => {
  return props.memory.aversion_score || 0
})

// Calculate age in days
const ageInDays = computed(() => {
  return Math.round(props.memory.age_in_seconds / (24 * 60 * 60))
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
  else if (props.memory.retrieval_count >= props.longTermMemoryThreshold) {
    return {
      type: 'long-term',
      label: 'Long-term',
      color: 'text-indigo-600 dark:text-indigo-400',
    }
  }
  else if (props.memory.retrieval_count > 0) {
    return {
      type: 'working',
      label: 'Working',
      color: 'text-blue-600 dark:text-blue-400',
    }
  }
  else {
    return {
      type: 'short-term',
      label: 'Short-term',
      color: 'text-red-600 dark:text-red-400',
    }
  }
})

// Progress percentage for memory strength
const strengthPercentage = computed(() => {
  return Math.round((props.memory.decayed_score / props.memory.score) * 100)
})

// Progress towards long-term memory
const ltmPercentage = computed(() => {
  if (props.memory.retrieval_count >= props.longTermMemoryThreshold) {
    return 100
  }
  return Math.round((props.memory.retrieval_count / props.longTermMemoryThreshold) * 100)
})

// Progress towards muscle memory
const musclePercentage = computed(() => {
  if (props.memory.retrieval_count >= props.muscleMemoryThreshold) {
    return 100
  }
  return Math.round((props.memory.retrieval_count / props.muscleMemoryThreshold) * 100)
})

function simulateRetrieval(emotionalResponse = null) {
  if (emotionalResponse === 'joy') {
    emit('retrieve', props.memory.id, { joyModifier: 0.1, aversionModifier: -0.05 })
  }
  else if (emotionalResponse === 'aversion') {
    emit('retrieve', props.memory.id, { joyModifier: -0.05, aversionModifier: 0.1 })
  }
  else {
    emit('retrieve', props.memory.id, { joyModifier: 0, aversionModifier: 0 })
  }
}
</script>

<template>
  <div class="flex flex-col justify-between rounded-lg bg-white p-4 shadow dark:bg-neutral-800/50">
    <div class="mb-4 flex justify-between">
      <h3 class="font-bold">
        {{ memory.id }}
      </h3>
      <div class="flex gap-2">
        <button
          class="rounded-lg bg-blue-100 px-3 py-1 text-xs font-medium dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800" h-fit
          @click="simulateRetrieval()"
        >
          Neutral Retrieval
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 mb-4 gap-3" text-sm font-mono>
      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Memory Phase:
      </div>
      <div class="font-medium" text-right text-nowrap :class="memoryStatus.color">
        {{ memoryStatus.label }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Base Score:
      </div>
      <div class="font-medium" text-right>
        {{ Math.round(memory.score) }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Current Score:
      </div>
      <div class="font-medium" text-right>
        {{ Math.round(memory.decayed_score) }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Retrieval Count:
      </div>
      <div class="font-medium" text-right>
        {{ memory.retrieval_count }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Age:
      </div>
      <div class="font-medium" text-right>
        {{ ageInDays }} days
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Joy Score:
      </div>
      <div class="font-medium" text-right :class="joyLevel > 0.5 ? 'text-yellow-500' : ''">
        {{ (joyLevel * 100).toFixed(0) }}%
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
        Aversion Score:
      </div>
      <div class="font-medium" text-right :class="aversionLevel > 0.5 ? 'text-red-500' : ''">
        {{ (aversionLevel * 100).toFixed(0) }}%
      </div>
    </div>

    <!-- Emotional response buttons -->
    <div class="grid grid-cols-2 mb-4 gap-2">
      <button
        class="rounded-lg bg-yellow-100 px-3 py-2 text-sm font-medium dark:bg-yellow-900 hover:bg-yellow-200 dark:hover:bg-yellow-800"
        @click="simulateRetrieval('joy')"
      >
        Joyful Retrieval (+0.1)
      </button>
      <button
        class="rounded-lg bg-red-100 px-3 py-2 text-sm font-medium dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800"
        @click="simulateRetrieval('aversion')"
      >
        Aversive Retrieval (+0.1)
      </button>
    </div>

    <!-- Visual representation of current state -->
    <div>
      <!-- Memory Strength Progress -->
      <div class="mt-4" font-mono>
        <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Memory Strength:
        </div>
        <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
          <div
            class="h-full max-w-full transition-all duration-500"
            :class="memoryStatus.type === 'muscle-memory' ? 'bg-purple-400' : memoryStatus.type === 'long-term' ? 'bg-indigo-500' : 'bg-blue-500'"
            :style="`width: ${strengthPercentage}%`"
          />
        </div>
        <div class="mt-1 flex justify-between text-xs">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <!-- Long-term Memory Progress -->
      <div class="mt-4" font-mono>
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
          <span>Short-term</span>
          <span v-if="memory.retrieval_count < longTermMemoryThreshold" class="text-sm font-medium">
            {{ memory.retrieval_count }}/{{ longTermMemoryThreshold }} retrievals
          </span>
          <span v-else class="text-sm text-indigo-600 font-medium dark:text-indigo-400">
            LTM formed
          </span>
          <span>Long-term</span>
        </div>
      </div>

      <!-- Muscle Memory Progress -->
      <div class="mt-4" font-mono>
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
              :style="`width: ${joyLevel * 100}%`"
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
              :style="`width: ${aversionLevel * 100}%`"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
