<script setup lang="ts">
import { FieldButton, FieldInput } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'

import { useMemoryDb } from '../../../composables/use-memory-db'

const memoryDb = useMemoryDb()
const stats = ref({ total: 0, shortTerm: 0, longTerm: 0 })
const customPath = ref('')
const statusMessage = ref('')
const isLoading = ref(false)

onMounted(async () => {
  await loadStats()
  await checkDbStatus()
})

async function loadStats() {
  try {
    const result = await memoryDb.getStats()
    if (result.success) {
      stats.value = result.stats
    }
  }
  catch (error) {
    console.error('Failed to load stats:', error)
  }
}

async function checkDbStatus() {
  try {
    await memoryDb.checkInitialized()
    if (memoryDb.isInitialized.value) {
      const pathResult = await memoryDb.getDatabasePath()
      if (pathResult.success) {
        memoryDb.dbPath.value = pathResult.path
      }
    }
  }
  catch (error) {
    console.error('Failed to check database status:', error)
  }
}

async function initializeDatabase() {
  isLoading.value = true
  statusMessage.value = ''
  try {
    const result = await memoryDb.initialize(customPath.value || undefined)
    if (result.success) {
      statusMessage.value = `Database initialized at: ${result.dbPath}`
      await loadStats()
    }
    else {
      statusMessage.value = 'Failed to initialize database'
    }
  }
  catch (error) {
    statusMessage.value = `Error: ${error}`
    console.error('Failed to initialize database:', error)
  }
  finally {
    isLoading.value = false
  }
}

async function clearAllData() {
  if (!confirm('Are you sure you want to clear all memory data? This cannot be undone.')) {
    return
  }

  isLoading.value = true
  statusMessage.value = ''
  try {
    const result = await memoryDb.clearAllMemories()
    if (result.success) {
      statusMessage.value = 'All memories cleared successfully'
      await loadStats()
    }
    else {
      statusMessage.value = 'Failed to clear memories'
    }
  }
  catch (error) {
    statusMessage.value = `Error: ${error}`
    console.error('Failed to clear memories:', error)
  }
  finally {
    isLoading.value = false
  }
}

async function selectDatabaseFolder() {
  // This would normally use Electron's dialog API
  // For now, users can manually enter the path
  statusMessage.value = 'Please enter the database path manually'
}
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-6', 'p-6']">
    <div :class="['text-2xl', 'font-bold']">
      Memory Database (SQLite)
    </div>

    <div :class="['text-sm', 'opacity-70']">
      Manage SQLite database for storing memory information. This database is separate from browser storage.
    </div>

    <!-- Database Status -->
    <div :class="['rounded-lg', 'border', 'border-gray-200', 'dark:border-gray-700', 'p-4']">
      <div :class="['text-lg', 'font-semibold', 'mb-3']">
        Database Status
      </div>
      <div :class="['space-y-2', 'text-sm']">
        <div :class="['flex', 'justify-between']">
          <span :class="['opacity-70']">Initialized:</span>
          <span :class="[memoryDb.isInitialized.value ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400']">
            {{ memoryDb.isInitialized.value ? 'Yes' : 'No' }}
          </span>
        </div>
        <div v-if="memoryDb.isInitialized.value" :class="['flex', 'justify-between']">
          <span :class="['opacity-70']">Location:</span>
          <span :class="['text-right', 'max-w-md', 'truncate', 'font-mono', 'text-xs']">
            {{ memoryDb.dbPath.value }}
          </span>
        </div>
      </div>
    </div>

    <!-- Statistics -->
    <div :class="['rounded-lg', 'border', 'border-gray-200', 'dark:border-gray-700', 'p-4']">
      <div :class="['text-lg', 'font-semibold', 'mb-3']">
        Memory Statistics
      </div>
      <div :class="['grid', 'grid-cols-3', 'gap-4']">
        <div :class="['text-center']">
          <div :class="['text-2xl', 'font-bold', 'text-blue-600', 'dark:text-blue-400']">
            {{ stats.total }}
          </div>
          <div :class="['text-sm', 'opacity-70']">
            Total
          </div>
        </div>
        <div :class="['text-center']">
          <div :class="['text-2xl', 'font-bold', 'text-green-600', 'dark:text-green-400']">
            {{ stats.shortTerm }}
          </div>
          <div :class="['text-sm', 'opacity-70']">
            Short-Term
          </div>
        </div>
        <div :class="['text-center']">
          <div :class="['text-2xl', 'font-bold', 'text-purple-600', 'dark:text-purple-400']">
            {{ stats.longTerm }}
          </div>
          <div :class="['text-sm', 'opacity-70']">
            Long-Term
          </div>
        </div>
      </div>
    </div>

    <!-- Initialize Database -->
    <div :class="['rounded-lg', 'border', 'border-gray-200', 'dark:border-gray-700', 'p-4']">
      <div :class="['text-lg', 'font-semibold', 'mb-3']">
        Initialize Database
      </div>
      <div :class="['space-y-4']">
        <FieldInput
          v-model="customPath"
          type="text"
          label="Custom Database Path (Optional)"
          description="Leave empty to use default location in user data folder"
          placeholder="/path/to/memory.db"
        />
        <FieldButton
          :disabled="isLoading"
          @click="initializeDatabase"
        >
          {{ isLoading ? 'Initializing...' : 'Initialize Database' }}
        </FieldButton>
      </div>
    </div>

    <!-- Actions -->
    <div :class="['rounded-lg', 'border', 'border-red-200', 'dark:border-red-700', 'p-4']">
      <div :class="['text-lg', 'font-semibold', 'mb-3', 'text-red-600', 'dark:text-red-400']">
        Danger Zone
      </div>
      <div :class="['space-y-4']">
        <FieldButton
          :disabled="isLoading || !memoryDb.isInitialized.value"
          variant="destructive"
          @click="clearAllData"
        >
          Clear All Memory Data
        </FieldButton>
      </div>
    </div>

    <!-- Status Message -->
    <div
      v-if="statusMessage"
      :class="[
        'mt-4',
        'rounded-lg',
        'p-4',
        'text-sm',
        statusMessage.includes('Error') || statusMessage.includes('Failed')
          ? ['bg-red-100', 'dark:bg-red-900/30', 'text-red-800', 'dark:text-red-200']
          : ['bg-blue-100', 'dark:bg-blue-900/30', 'text-blue-800', 'dark:text-blue-200'],
      ]"
    >
      {{ statusMessage }}
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
