<!-- src/MemoryDecaySimulator.vue -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import MemoryModelSettings from '../components/Memory/DecayModelSettings.vue'
import TimeControls from '../components/Memory/DecayTimeSettings.vue'
import MemoryDetails from '../components/Memory/RecordDetail.vue'
import MemoryChart from '../components/Memory/VisualizeChart.vue'
import MemoryTable from '../components/Memory/VisualizeTable.vue'
import { connectToDatabase, createSchema, generateDecayQuery, loadSampleData, simulateRetrieval } from '../composables/memory/db'

interface MemoryDataItem {
  storyid: string
  score: number
  lastupdate: string // ISO timestamp
  last_retrieved_at: string // ISO timestamp
  retrieval_count: number
  lastupdate_str: string
  last_retrieved_str: string
  age_in_seconds: number
  time_since_retrieval: number
  ltm_factor?: number // Optional since it's only present when longTermMemoryEnabled is true
  decayed_score: number
}

// Database references
const db = ref(null)
const isMigrated = ref(false)

// Data and query results
const rawData = ref<MemoryDataItem[]>([])
const decayedResults = ref<MemoryDataItem[]>([])

// Parameters for decay function
const decayRate = ref(0.0990)
const timeUnit = ref('days')
const maxDaysToShow = ref(30)
const selectedStoryId = ref(null)

// Time acceleration parameters
const timeMultiplier = ref(60 * 60 * 24) // Default: 1 day/second
const isTimeAccelerated = ref(false)
const simulatedTimeOffset = ref(0)
const lastTickTime = ref(Date.now())

// Advanced memory model parameters
const retrievalBoost = ref(0.25)
const retrievalDecaySlowdown = ref(0.8)
const longTermMemoryEnabled = ref(true)
const longTermMemoryThreshold = ref(5)
const longTermMemoryStability = ref(0.3)
const longTermMemoryVisualize = ref(true)

// UI elements
const showInfoPanel = ref(false)

// Selected memory
const selectedMemory = computed(() => {
  if (!selectedStoryId.value || !decayedResults.value.length)
    return null
  return decayedResults.value.find(s => s.storyid === selectedStoryId.value)
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

// Initialize database and load data
async function initialize() {
  db.value = await connectToDatabase()
  await createSchema(db.value)
  await loadSampleData(db.value)
  isMigrated.value = true
  await loadData()
}

// Load data from the database
async function loadData() {
  rawData.value = await db.value?.execute(`
    SELECT storyid, score, lastupdate, last_retrieved_at, retrieval_count,
           CAST(lastupdate AS VARCHAR) as lastupdate_str,
           CAST(last_retrieved_at AS VARCHAR) as last_retrieved_str
    FROM currentscores
    ORDER BY score DESC
  `) || []
  await runDecayQuery()
}

const decayQuery = ref('')

watch([simulatedTimeOffset, decayRate, timeUnit, longTermMemoryEnabled, longTermMemoryThreshold, longTermMemoryStability, retrievalBoost, retrievalDecaySlowdown], async () => {
  const query = await generateDecayQuery(db.value, {
    simulatedTimeOffset: simulatedTimeOffset.value,
    decayRate: decayRate.value,
    timeUnitInSeconds: timeUnitInSeconds.value,
    longTermMemoryEnabled: longTermMemoryEnabled.value,
    longTermMemoryThreshold: longTermMemoryThreshold.value,
    longTermMemoryStability: longTermMemoryStability.value,
    retrievalBoost: retrievalBoost.value,
    retrievalDecaySlowdown: retrievalDecaySlowdown.value,
  })

  decayQuery.value = query
})

// Run the decay query
async function runDecayQuery() {
  if (!decayQuery.value)
    return

  decayedResults.value = await db.value?.execute(decayQuery.value) || []

  // Initialize selectedStoryId if not set or update if selection changed
  if (!selectedStoryId.value && decayedResults.value.length) {
    selectedStoryId.value = decayedResults.value[0].storyid
  }
}

// Handle simulated retrieval
async function handleRetrieval(storyId) {
  await simulateRetrieval(db.value, storyId, currentSimulatedTime.value)
  await loadData()
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
  }

  simulatedTimeOffset.value += amount * secondsToAdd
  await runDecayQuery()
}

// Toggle info panel
function toggleInfoPanel() {
  showInfoPanel.value = !showInfoPanel.value
}

// Time acceleration handling
function tickTime() {
  if (!isTimeAccelerated.value)
    return

  const now = Date.now()
  const elapsedMs = now - lastTickTime.value
  simulatedTimeOffset.value += (elapsedMs / 1000) * timeMultiplier.value
  lastTickTime.value = now

  runDecayQuery()
  requestAnimationFrame(tickTime)
}

// Watch for parameter changes
watch([
  decayRate,
  timeUnit,
  maxDaysToShow,
  retrievalBoost,
  retrievalDecaySlowdown,
  longTermMemoryEnabled,
  longTermMemoryThreshold,
  longTermMemoryStability,
  longTermMemoryVisualize,
], async () => {
  if (isMigrated.value) {
    await runDecayQuery()
  }
})

// Watch time acceleration state
watch(isTimeAccelerated, (newValue) => {
  if (newValue) {
    lastTickTime.value = Date.now()
    tickTime()
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
  <div class="mx-auto max-w-7xl">
    <!-- Loading state -->
    <div v-if="!isMigrated" class="py-8 text-center">
      <div class="mx-auto h-8 w-8 animate-spin border-4 border-blue-500 border-t-transparent rounded-full" />
      <p class="mt-4">
        Initializing database and sample data...
      </p>
    </div>

    <div v-else>
      <header class="mb-6">
        <h1 class="mb-2 text-2xl font-bold">
          Memory Decay & Retention Simulator
        </h1>
        <div class="flex items-center justify-between">
          <p class="max-w-2xl text-neutral-600 dark:text-neutral-300">
            Visualize how memories decay over time and how repeated retrievals create long-term memory
            <button class="ml-2 text-blue-500 hover:underline" @click="toggleInfoPanel">
              {{ showInfoPanel ? 'Hide info' : 'Learn more' }}
            </button>
          </p>
        </div>
      </header>

      <!-- Info Panel -->
      <div v-if="showInfoPanel" class="mb-6 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-700/20">
        <h2 class="mb-2 text-lg font-semibold">
          About Memory Decay and Long-Term Memory Formation
        </h2>
        <p class="mb-2">
          This simulator models both the forgetting curve and how memories become more stable with repeated retrievals:
        </p>
        <div class="my-3 rounded bg-white p-3 text-center font-mono dark:bg-neutral-800">
          score * exp(-decay_rate * time_elapsed / time_unit * (1 - ltm_factor)) * (1 + retrieval_boost)
        </div>
        <p class="font-medium">
          The simulator models three key memory phenomena:
        </p>
        <ol class="mt-2 list-decimal pl-5 space-y-1">
          <li>
            <strong>Exponential decay</strong>: Memories naturally fade over time following Ebbinghaus' forgetting curve
          </li>
          <li>
            <strong>Retrieval practice effect</strong>: Each retrieval boosts the memory strength temporarily
          </li>
          <li>
            <strong>Long-term memory formation</strong>: After sufficient retrievals, memories become increasingly stable
            and resistant to decay, eventually becoming "permanent"
          </li>
        </ol>
        <p class="mt-3">
          This reflects how the brain forms long-term memories through a process of neural consolidation,
          where repeated activation of neural pathways leads to structural changes that stabilize memories.
          The spaced repetition study method leverages this effect for efficient learning.
        </p>
      </div>

      <!-- Interactive Chart Section -->
      <div class="grid grid-cols-1 mb-4 gap-4 lg:grid-cols-3">
        <!-- Chart -->
        <MemoryChart
          :memory-data="decayedResults"
          :selected-story-id="selectedStoryId"
          :decay-rate="decayRate"
          :max-days-to-show="maxDaysToShow"
          :long-term-memory-enabled="longTermMemoryEnabled"
          :long-term-memory-threshold="longTermMemoryThreshold"
          :long-term-memory-visualize="longTermMemoryVisualize"
          :retrieval-boost="retrievalBoost"
          :retrieval-decay-slowdown="retrievalDecaySlowdown"
          class="lg:col-span-2"
        />

        <!-- Selected Memory Details -->
        <MemoryDetails
          v-if="selectedMemory"
          :memory="selectedMemory"
          :long-term-memory-enabled="longTermMemoryEnabled"
          :long-term-memory-threshold="longTermMemoryThreshold"
          @retrieve="handleRetrieval"
        />
      </div>

      <!-- Time Controls -->
      <TimeControls
        v-model:simulated-time-offset="simulatedTimeOffset"
        v-model:is-time-accelerated="isTimeAccelerated"
        v-model:time-multiplier="timeMultiplier"
        class="mb-4"
        @time-jump="handleTimeJump"
      />

      <!-- Memory Model Settings -->
      <MemoryModelSettings
        v-model:long-term-memory-enabled="longTermMemoryEnabled"
        v-model:long-term-memory-threshold="longTermMemoryThreshold"
        v-model:long-term-memory-stability="longTermMemoryStability"
        v-model:long-term-memory-visualize="longTermMemoryVisualize"
        v-model:retrieval-boost="retrievalBoost"
        v-model:retrieval-decay-slowdown="retrievalDecaySlowdown"
        v-model:decay-rate="decayRate"
        v-model:time-unit="timeUnit"
        v-model:max-days-to-show="maxDaysToShow"
      />

      <!-- Memory Table -->
      <MemoryTable
        :memories="decayedResults"
        :selected-id="selectedStoryId"
        :long-term-memory-enabled="longTermMemoryEnabled"
        :long-term-memory-threshold="longTermMemoryThreshold"
        class="mb-4"
        @select="selectedStoryId = $event"
        @retrieve="handleRetrieval"
      />

      <!-- SQL Query Preview -->
      <div class="max-w-full rounded-xl bg-neutral-50 dark:bg-neutral-800">
        <div class="overflow-x-scroll rounded bg-neutral-800 text-sm text-neutral-200" font-mono>
          <pre whitespace-pre-wrap>
            <code>{{ decayQuery }}</code>
          </pre>
        </div>
      </div>
    </div>
  </div>
</template>
