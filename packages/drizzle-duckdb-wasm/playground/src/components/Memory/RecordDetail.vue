<!-- src/components/MemoryDetails.vue -->
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  memory: {
    type: Object,
    required: true,
  },
  longTermMemoryEnabled: {
    type: Boolean,
    required: true,
  },
  longTermMemoryThreshold: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['retrieve'])

// Calculate age in days
const ageInDays = computed(() => {
  return Math.round(props.memory.age_in_seconds / (24 * 60 * 60))
})

// Calculate memory status
const memoryStatus = computed(() => {
  if (props.longTermMemoryEnabled && props.memory.retrieval_count >= props.longTermMemoryThreshold) {
    return {
      type: 'long-term',
      label: `Long-term`,
      color: 'text-purple-600 dark:text-purple-400',
    }
  }
  else if (props.memory.retrieval_count > 0) {
    return {
      type: 'working',
      label: props.longTermMemoryEnabled
        ? `Working`
        : 'Working memory',
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

// Progress percentage for LTM
const ltmPercentage = computed(() => {
  if (props.memory.retrieval_count >= props.longTermMemoryThreshold) {
    return Math.round(Number.parseFloat(props.memory.ltm_factor || 0) * 100)
  }
  else {
    return Math.round((props.memory.retrieval_count / props.longTermMemoryThreshold) * 100)
  }
})

function simulateRetrieval() {
  emit('retrieve', props.memory.storyid)
}
</script>

<template>
  <div class="flex flex-col justify-between rounded-lg bg-white p-4 shadow dark:bg-neutral-800/50">
    <div class="flex justify-between">
      <h3 class="font-bold">
        {{ memory.storyid }}
      </h3>
      <button
        class="rounded-lg bg-blue-100 px-3 py-1 text-xs font-medium dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800" h-fit
        @click="simulateRetrieval"
      >
        Simulate Retrieval
      </button>
    </div>

    <div>
      <div class="grid grid-cols-2 mb-6 mt-2 gap-3" text-sm font-mono>
        <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Phase:
        </div>
        <div class="font-medium" text-right text-nowrap :class="memoryStatus.color">
          {{ memoryStatus.label }}
        </div>

        <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Original Score:
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
          % Remaining:
        </div>
        <div class="font-medium" text-right>
          {{ strengthPercentage }}%
        </div>

        <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Creation Date:
        </div>
        <div class="font-medium" text-right>
          {{ new Date(memory.lastupdate).toLocaleDateString() }}
        </div>

        <div class="text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Last Retrieved:
        </div>
        <div class="font-medium" text-right>
          {{ new Date(memory.last_retrieved_at).toLocaleDateString() }}
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
      </div>
    </div>

    <div>
      <!-- Visual representation of decay -->
      <div class="mt-4" font-mono>
        <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Memory Strength:
        </div>
        <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
          <div
            class="h-full max-w-full transition-all duration-500"
            :class="longTermMemoryEnabled && memory.retrieval_count >= longTermMemoryThreshold ? 'bg-purple-400' : 'bg-blue-500'"
            :style="`width: ${strengthPercentage}%`"
          />
        </div>
        <div class="mt-1 flex justify-between text-xs">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <!-- LTM Progress -->
      <div v-if="longTermMemoryEnabled && memory.retrieval_count > 0" class="mt-4" font-mono>
        <div class="mb-1 text-sm text-neutral-500 dark:text-neutral-400" tracking-tight>
          Long-term Memory Progress:
        </div>
        <div class="h-7 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-600">
          <div
            class="h-full max-w-full bg-purple-400 transition-all duration-500"
            :style="`width: ${ltmPercentage}%`"
          />
        </div>
        <div class="mt-1 flex items-center justify-between">
          <span class="text-xs">Short-term</span>
          <span v-if="memory.retrieval_count < longTermMemoryThreshold" class="text-sm font-medium">
            {{ memory.retrieval_count }}/{{ longTermMemoryThreshold }} retrievals
          </span>
          <span v-else class="text-sm text-purple-600 font-medium dark:text-purple-400">
            {{ Math.round(Number.parseFloat(memory.ltm_factor || 0) * 100) }}% stable
          </span>
          <span class="text-xs">Permanent</span>
        </div>
      </div>
    </div>
  </div>
</template>
