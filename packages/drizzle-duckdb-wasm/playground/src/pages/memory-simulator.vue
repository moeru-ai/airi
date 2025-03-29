<script setup lang="ts">
import type { EmotionalMemoryItem } from '../types/memory/emotional-memory'

import { useDebounceFn } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

// Import the components
import EmotionalMemoryChart from '../components/Memory/EmotionalMemoryChart.vue'
import EmotionalMemoryDetail from '../components/Memory/EmotionalMemoryDetail.vue'
import EmotionalSettings from '../components/Memory/EmotionalSettings.vue'
import MemoryRetrievalHeatmap from '../components/Memory/MemoryRetrievalHeatmap.vue'
import Range from '../components/Range.vue'
import {
  connectToDatabase,
  createEmotionalSchema,
  generateEmotionalDecayQuery as generateEmotionalQuery,
  loadEmotionalSampleData,
  simulateEmotionalRetrieval,
} from '../composables/memory/memory-decay-db'

// Database references
const db = ref(null)
const isMigrated = ref(false)

// Data and query results
const processedResults = ref<EmotionalMemoryItem[]>([])
const selectedMemoryId = ref(null)

// Memory model parameters
const decayRate = ref(0.0990)
const timeUnit = ref('days')
const maxDaysToProject = ref(2000)

// Emotional memory parameters
const joyBoostFactor = ref(1.5)
const joyDecaySteepness = ref(3.0)
const aversionSpikeFactor = ref(2.0)
const aversionStability = ref(1.2)
const randomRecallProbability = ref(0.05)
const flashbackIntensity = ref(2.0)

// Time simulation parameters
const timeMultiplier = ref(1) // Default: 1 day/second
const isTimeAccelerated = ref(false)
const simulatedTimeOffset = ref(0)
const lastTickTime = ref(Date.now())

// Memory access thresholds
const longTermThreshold = ref(5)
const muscleMemoryThreshold = ref(40)

// UI controls
const showAdvancedSettings = ref(false)

// Selected memory
const selectedMemory = computed(() => {
  if (!selectedMemoryId.value || !processedResults.value.length)
    return null
  return processedResults.value.find(m => m.id === selectedMemoryId.value)
})

// Time unit in seconds
const timeUnitInSeconds = computed(() => {
  switch (timeUnit.value) {
    case 'hours': return 60 * 60
    case 'days': return 24 * 60 * 60
    case 'weeks': return 7 * 24 * 60 * 60
    case 'months': return 30 * 24 * 60 * 60
    default: return 24 * 60 * 60
  }
})

// Current simulated time
const currentSimulatedTime = computed(() => {
  const now = new Date()
  now.setSeconds(now.getSeconds() + simulatedTimeOffset.value)
  return now
})

// Add a new ref for heatmap configuration
const heatmapTimeRange = ref(30) // Show last 30 days by default

// Add this after the other refs
const memoryHistory = ref(new Map())

// Maximum number of history points to track per memory
const historyLength = 20

// Initialize database and load data
async function initialize() {
  db.value = await connectToDatabase()
  await createEmotionalSchema(db.value)
  await loadEmotionalSampleData(db.value)
  isMigrated.value = true
  await runDecayQuery()
}

// Emotional decay query
const emotionalDecayQuery = ref('')

// Watch for parameter changes
watch([
  simulatedTimeOffset,
  decayRate,
  timeUnit,
  longTermThreshold,
  muscleMemoryThreshold,
  joyBoostFactor,
  joyDecaySteepness,
  aversionSpikeFactor,
  aversionStability,
  randomRecallProbability,
  flashbackIntensity,
], async () => {
  const query = await generateEmotionalQuery(db.value, {
    simulatedTimeOffset: simulatedTimeOffset.value,
    decayRate: decayRate.value,
    timeUnitInSeconds: timeUnitInSeconds.value,
    longTermMemoryEnabled: true,
    longTermMemoryThreshold: longTermThreshold.value,
    longTermMemoryStability: 0.3,
    retrievalBoost: 0.25,
    retrievalDecaySlowdown: 0.8,
    joyBoostFactor: joyBoostFactor.value,
    joyDecaySteepness: joyDecaySteepness.value,
    aversionSpikeFactor: aversionSpikeFactor.value,
    aversionStability: aversionStability.value,
    randomRecallProbability: randomRecallProbability.value,
    flashbackIntensity: flashbackIntensity.value,
  })

  emotionalDecayQuery.value = query
})

// Run the decay query
async function runDecayQuery() {
  if (!emotionalDecayQuery.value)
    return

  const queryResults = await db.value?.execute(emotionalDecayQuery.value) || []

  // Update memory history with new data points
  for (const memory of queryResults) {
    // Initialize history array if doesn't exist
    if (!memoryHistory.value.has(memory.id)) {
      memoryHistory.value.set(memory.id, [])
    }

    const history = memoryHistory.value.get(memory.id)

    // Add current state to history with timestamp
    history.push({
      timestamp: Date.now(),
      simulatedTime: simulatedTimeOffset.value,
      score: memory.decayed_score,
      joy: memory.joy_score,
      aversion: memory.aversion_score,
      retrievalCount: memory.retrieval_count,
    })

    // Trim history to maintain fixed length
    if (history.length > historyLength) {
      history.shift()
    }
  }

  processedResults.value = queryResults

  // Initialize selectedMemoryId if not set or update if selection changed
  if (!selectedMemoryId.value && processedResults.value.length) {
    selectedMemoryId.value = processedResults.value[0].id
  }

  generateChartData()
}

// Generate chart data
function generateChartData() {
  // Add calculated properties to the memory items for easier access
  processedResults.value = processedResults.value.map((item) => {
    const ageInDays = Math.round(item.age_in_seconds / (24 * 60 * 60))
    return {
      ...item,
      age_in_days: ageInDays,
      joyComponent: item.joy_score * joyBoostFactor.value,
      aversionComponent: item.aversion_score * aversionSpikeFactor.value,
      effective_score: item.decayed_score,
    }
  })
}

// Handle simulated retrieval with emotional response
async function handleRetrieval(memoryId, { joyModifier = 0, aversionModifier = 0 } = {}) {
  await simulateEmotionalRetrieval(db.value, memoryId, new Date(Date.now() + simulatedTimeOffset.value * 1000), {
    joyModifier,
    aversionModifier,
  })
  await runDecayQuery()
}

// New function to process random retrievals
async function processRandomRetrievals() {
  // Only run if database is initialized
  if (!db.value || !processedResults.value?.length)
    return

  // For each memory, check if it should be randomly retrieved based on randomRecallProbability
  for (const memory of processedResults.value) {
    // Apply the same random check that's in the SQL
    if (Math.random() < randomRecallProbability.value) {
      // Determine if this should be a joy or aversion-based recall
      // Use the existing emotional components to guide this
      let joyModifier = 0
      let aversionModifier = 0

      if (memory.joy_score > memory.aversion_score && memory.joy_score > 0.3) {
        joyModifier = 0.05
      }
      else if (memory.aversion_score > 0.3) {
        aversionModifier = 0.05
      }

      // Call the regular retrieval function
      await simulateEmotionalRetrieval(
        db.value,
        memory.id,
        new Date(Date.now() + simulatedTimeOffset.value * 1000),
        { joyModifier, aversionModifier },
      )
    }
  }

  // Update the UI
  await runDecayQuery()
}

// Handle memory projection reset
async function resetProjection() {
  await loadEmotionalSampleData(db.value) // true flag to reset data
  simulatedTimeOffset.value = 0
  await runDecayQuery()
}

// Handle time jump
async function handleTimeJump({ amount, unit }) {
  let secondsToAdd = 0

  switch (unit) {
    case 'hour':
      secondsToAdd = 60 * 60
      break
    case 'day':
      secondsToAdd = 24 * 60 * 60
      break
    case 'week':
      secondsToAdd = 7 * 24 * 60 * 60
      break
    case 'month':
      secondsToAdd = 30 * 24 * 60 * 60
      break
    case 'year':
      secondsToAdd = 365 * 24 * 60 * 60
      break
  }

  simulatedTimeOffset.value += amount * secondsToAdd
  await runDecayQuery()
}

// Time acceleration handling
function baseTickTime() {
  if (!isTimeAccelerated.value)
    return

  const now = Date.now()
  const elapsedMs = now - lastTickTime.value
  simulatedTimeOffset.value += (elapsedMs / 1000) * timeMultiplier.value
  lastTickTime.value = now

  runDecayQuery()

  // Process random retrievals based on elapsed time
  // We'll check for random retrievals every few seconds of simulated time
  if (Math.random() < (elapsedMs / 5000) * timeMultiplier.value) {
    processRandomRetrievals()
  }
}

const debouncedTickTime = useDebounceFn(() => {
  baseTickTime()
  requestAnimationFrame(debouncedTickTime)
}, 1000)

// Add a button to manually trigger random retrievals for testing
async function triggerRandomRetrievals() {
  await processRandomRetrievals()
}

// Watch time acceleration state
watch(isTimeAccelerated, (newValue) => {
  if (newValue) {
    lastTickTime.value = Date.now()
    debouncedTickTime()
  }
})

// Watch time multiplier changes
watch(timeMultiplier, () => {
  if (isTimeAccelerated.value) {
    lastTickTime.value = Date.now()
  }
})

// Lifecycle hooks
onMounted(async () => {
  await initialize()
  isTimeAccelerated.value = true
})

onUnmounted(() => {
  isTimeAccelerated.value = false
  db.value?.$client.then(client => client.close())
})
</script>

<template>
  <div>
    <template v-if="!isMigrated">
      <!-- Loading state -->
      <div class="py-8 text-center">
        <div class="mx-auto h-8 w-8 animate-spin border-4 border-blue-500 border-t-transparent rounded-full" />
        <p class="mt-4">
          Initializing database and sample data...
        </p>
      </div>
    </template>

    <template v-else>
      <header class="mb-4">
        <h1 class="mb-2 text-2xl font-bold">
          Memory Flashback & Retrieval Simulator
        </h1>
        <div class="flex items-center justify-between">
          <p class="max-w-2xl text-neutral-600 dark:text-neutral-300">
            Visualize how memories could be retrieved and impacted by emotional state
          </p>
        </div>
      </header>

      <!-- Time Controls -->
      <div class="my-4 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-800/50">
        <h2 class="mb-2 flex items-center text-lg font-semibold" gap-4>
          <div flex-1>
            Time Simulation
          </div>
          <div class="text-sm font-mono">
            {{ currentSimulatedTime.toLocaleString() }}
          </div>
          <button
            :class="{ 'bg-red-100 dark:bg-red-900': isTimeAccelerated, 'bg-green-100 dark:bg-green-900': !isTimeAccelerated }"
            class="rounded-lg px-4 py-2 font-medium transition-colors"
            @click="isTimeAccelerated = !isTimeAccelerated"
          >
            <div v-if="isTimeAccelerated" i-solar:pause-bold />
            <div v-else i-solar:play-bold />
          </button>

          <button
            class="rounded-lg bg-neutral-200 px-4 py-2 font-medium dark:bg-neutral-700"
            @click="resetProjection"
          >
            <div i-solar:restart-line-duotone />
          </button>
        </h2>

        <!-- Time jump shortcuts -->
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
            @click="handleTimeJump({ amount: 1, unit: 'day' })"
          >
            +1 Day
          </button>

          <button
            class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
            @click="handleTimeJump({ amount: 1, unit: 'week' })"
          >
            +1 Week
          </button>

          <button
            class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
            @click="handleTimeJump({ amount: 1, unit: 'month' })"
          >
            +1 Month
          </button>

          <button
            class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
            @click="handleTimeJump({ amount: 1, unit: 'year' })"
          >
            +1 Year
          </button>

          <button
            class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
            @click="handleTimeJump({ amount: 5, unit: 'year' })"
          >
            +5 Years
          </button>

          <!-- New button to trigger random retrievals -->
          <button
            class="rounded-lg bg-purple-100 px-3 py-1 text-sm dark:bg-purple-900"
            title="Trigger random memory recalls based on probability settings"
            @click="triggerRandomRetrievals"
          >
            Random Recalls
          </button>
        </div>

        <!-- Speed controls -->
        <div class="mt-4">
          <h3 class="font-medium">
            Speed
          </h3>
          <div class="grid grid-cols-2 mt-2 gap-2 md:grid-cols-6 sm:grid-cols-3">
            <button
              v-for="(speed, index) in [
                { label: '1 second/s', value: 1 },
                { label: '1 minute/s', value: 60 },
                { label: '1 hour/s', value: 60 * 60 },
                { label: '1 day/s', value: 60 * 60 * 24 },
                { label: '1 week/s', value: 60 * 60 * 24 * 7 },
                { label: '1 month/s', value: 60 * 60 * 24 * 30 },
              ]"
              :key="index"
              class="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              :class="timeMultiplier === speed.value ? 'bg-blue-200 dark:bg-blue-800' : 'bg-blue-100 dark:bg-blue-900'"
              @click="timeMultiplier = speed.value"
            >
              {{ speed.label }}
            </button>
          </div>
        </div>
      </div>

      <div>
        <MemoryRetrievalHeatmap
          :memory-data="processedResults"
          :simulated-time-offset="simulatedTimeOffset"
          :time-range="heatmapTimeRange"
          class="mb-4"
        />
      </div>

      <div>
        <!-- Chart and Detail View -->
        <div class="grid grid-cols-1 mb-4 gap-4 lg:grid-cols-3">
          <!-- Chart -->
          <EmotionalMemoryChart
            v-if="selectedMemory"
            :memory-data="processedResults"
            :selected-memory-id="selectedMemoryId"
            :decay-rate="decayRate"
            :max-days-to-project="maxDaysToProject"
            :long-term-threshold="longTermThreshold"
            :muscle-memory-threshold="muscleMemoryThreshold"
            :joy-boost-factor="joyBoostFactor"
            :joy-decay-steepness="joyDecaySteepness"
            :aversion-spike-factor="aversionSpikeFactor"
            :aversion-stability="aversionStability"
            class="lg:col-span-2"
          />

          <!-- Memory Details -->
          <EmotionalMemoryDetail
            v-if="selectedMemory"
            :memory="selectedMemory"
            :long-term-threshold="longTermThreshold"
            :muscle-memory-threshold="muscleMemoryThreshold"
            @retrieve="handleRetrieval"
          />
        </div>

        <div class="my-4">
          <label class="mb-1 block text-sm font-medium">Heatmap Time Range (days)</label>
          <div class="flex items-center gap-2">
            <Range
              v-model="heatmapTimeRange"
              :min="7"
              :max="120"
              :step="1"
              class="w-full"
            />
            <span class="w-12 text-right font-mono">{{ heatmapTimeRange }}</span>
          </div>
        </div>

        <!-- Time Controls -->
        <div class="mb-4 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-800/50">
          <EmotionalSettings
            v-model:joy-boost-factor="joyBoostFactor"
            v-model:joy-decay-steepness="joyDecaySteepness"
            v-model:aversion-spike-factor="aversionSpikeFactor"
            v-model:aversion-stability="aversionStability"
            v-model:random-recall-probability="randomRecallProbability"
            v-model:flashback-intensity="flashbackIntensity"
          />
        </div>

        <!-- Only show table if viewMode is table or combined -->
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
            <thead class="bg-neutral-100 dark:bg-neutral-800">
              <tr>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Rank
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  ID
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Base Score
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Joy Score
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Aversion Score
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Retrievals
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Age (days)
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Effective Score
                </th>
                <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody v-if="processedResults.length" class="bg-white divide-y divide-neutral-200 dark:bg-neutral-900 dark:divide-neutral-800">
              <tr
                v-for="(memory, idx) in processedResults"
                :key="memory.id"
                class="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
                :class="{ 'bg-blue-50 dark:bg-blue-900/20': memory.id === selectedMemoryId }"
                @click="selectedMemoryId = memory.id"
              >
                <td class="whitespace-nowrap px-4 py-2 text-sm font-medium">
                  {{ idx + 1 }}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  {{ memory.id }}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  {{ Math.round(memory.score) }}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  <span :class="memory.joy_score > 0.5 ? 'text-yellow-600 dark:text-yellow-400' : ''">
                    {{ Math.round(memory.joy_score * 100) }}%
                  </span>
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  <span :class="memory.aversion_score > 0.5 ? 'text-red-600 dark:text-red-400' : ''">
                    {{ Math.round(memory.aversion_score * 100) }}%
                  </span>
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  {{ memory.retrieval_count }}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  {{ Math.round(memory.age_in_seconds / (24 * 60 * 60)) }}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm font-medium">
                  {{ Math.round(memory.decayed_score) }}
                </td>
                <td class="whitespace-nowrap px-4 py-2">
                  <button
                    class="rounded-lg bg-blue-100 px-3 py-1 text-xs font-medium dark:bg-blue-900"
                    @click.stop="handleRetrieval(memory.id)"
                  >
                    Retrieve
                  </button>
                </td>
              </tr>
            </tbody>
            <tbody v-else class="bg-white dark:bg-neutral-900">
              <tr>
                <td colspan="9" class="px-4 py-8 text-center text-neutral-500">
                  No memory data available
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- SQL Query Preview (Optional for debugging) -->
        <div v-if="showAdvancedSettings" class="mt-6 max-w-full rounded-xl bg-neutral-50 dark:bg-neutral-800">
          <div class="overflow-x-scroll rounded bg-neutral-800 p-4 text-sm text-neutral-200">
            <pre class="whitespace-pre-wrap">
            <code>{{ emotionalDecayQuery }}</code>
          </pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
