<script setup lang="ts">
import { RadioCardManySelect, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { FieldInput } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'

// === EXISTING MEMORY SERVICE SETTINGS ===
const memoryServiceEnabled = useLocalStorage('settings/memory/enabled', false)
const chatStore = useChatStore()
const memoryServiceUrl = useLocalStorage('settings/memory/service-url', 'http://localhost:3001')
const apiKey = useLocalStorage('settings/memory/api-key', '')
const isConnected = ref(false)
const isTesting = ref(false)
const connectionStatus = ref('Click "Test Connection" to verify service')
const connectionMessage = ref('')
const connectionMessageType = ref<'success' | 'error' | null>(null)
const connectionError = ref('')

// === DATABASE CONNECTION INFO ===
const currentDbUrl = ref('')
const dbInfoMessage = ref('')
const boolSerializer = {
  read: (v: string) => v === 'true',
  write: (v: boolean) => String(v),
}

const embeddedPostgresEnabled = useLocalStorage<boolean>('settings/memory/embedded-postgres-enabled', false, { serializer: boolSerializer })
const pgLiteEnabled = useLocalStorage<boolean>('settings/memory/pglite-enabled', false, { serializer: boolSerializer })
const exportMessage = ref('Click and wait for success log...')
const importMessage = ref('')
const checkDbVariantMessage = ref ('')

// === REGENERATION STATUS ===
const isRegenerating = ref(false)
const regenerationProgress = ref(0)
const regenerationTotalItems = ref(0)
const regenerationProcessedItems = ref(0)
const regenerationTimeRemaining = ref<number | null>(null)
const regenerationBatchSize = ref(50)

// Function to format time remaining
function formatTimeRemaining(ms: number | null): string {
  if (ms === null)
    return 'Calculating...'

  const seconds = Math.round(ms / 1000)
  if (seconds < 60)
    return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60)
    return `${minutes}m ${remainingSeconds}s`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

// Function to fetch regeneration status
async function fetchRegenerationStatus() {
  try {
    const response = await fetch(`${memoryServiceUrl.value}/api/settings/regeneration-status`, {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch regeneration status')
    }

    const status = await response.json()
    isRegenerating.value = status.isRegenerating
    regenerationProgress.value = status.progress
    regenerationTotalItems.value = status.totalItems
    regenerationProcessedItems.value = status.processedItems
    regenerationTimeRemaining.value = status.estimatedTimeRemaining
    regenerationBatchSize.value = status.currentBatchSize
  }
  catch (error) {
    console.error('Failed to fetch regeneration status:', error)
  }
}

// === NEW LLM CONFIGURATION SETTINGS ===
const llmProvider = useLocalStorage('settings/memory/llm-provider', '')
const llmModel = useLocalStorage('settings/memory/llm-model', '')
const llmApiKey = useLocalStorage('settings/memory/llm-api-key', '')

// === NEW EMBEDDING CONFIGURATION SETTINGS ===
// These are the "committed" settings that persist
const embeddingProvider = useLocalStorage('settings/memory/embedding-provider', 'openai')
const embeddingModel = useLocalStorage('settings/memory/embedding-model', 'text-embedding-3-small')
const embeddingApiKey = useLocalStorage('settings/memory/embedding-api-key', '')
const embeddingDim = useLocalStorage('settings/memory/embedding-dim', 1536)

// === TEMPORARY EMBEDDING SETTINGS (for pending changes) ===
const tempEmbeddingProvider = ref('openai')
const tempEmbeddingModel = ref('text-embedding-3-small')
const tempEmbeddingApiKey = ref('')
const tempEmbeddingDim = ref(1536)
const tempEmbeddingDimStr = computed({
  get: () => String(tempEmbeddingDim.value),
  set: (v: string) => { tempEmbeddingDim.value = Number(v) },
})

// === PROVIDER OPTIONS ===
const llmProviders = [
  { value: 'openai', label: 'OpenAI', description: 'GPT models via OpenAI API' },
  { value: 'gemini', label: 'Google Gemini', description: 'Gemini models via Google AI' },
  { value: 'local', label: 'Ollama', description: 'Self-hosted Ollama models' },
]

const embeddingProviders = [
  { value: 'openai', label: 'OpenAI', description: 'Text embedding models via OpenAI API' },
  { value: 'gemini', label: 'Google Gemini', description: 'Embedding models via Google AI' },
  { value: 'local', label: 'Ollama', description: 'Self-hosted Ollama embedding models' },
]

// === MODEL OPTIONS BASED ON PROVIDER ===
const llmModels = computed(() => {
  switch (llmProvider.value) {
    case 'openai':
      return [
        { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo Preview', description: 'Latest GPT-4 Turbo model with preview features' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'GPT-4 Turbo with improved performance' },
        { id: 'gpt-4', name: 'GPT-4', description: 'Standard GPT-4 model' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient GPT-3.5 model' },
      ]
    case 'gemini':
      return [
        { id: 'gemini-pro', name: 'Gemini Pro', description: 'Google\'s most capable Gemini model' },
        { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', description: 'Gemini Pro with vision capabilities' },
      ]
    case 'local':
      return [
        { id: 'local-model', name: 'Self-hosted Ollama language model', description: 'Self-hosted Ollama language model' },
      ]
    default:
      return []
  }
})

const embeddingModels = computed(() => {
  switch (tempEmbeddingProvider.value) {
    case 'openai':
      return [
        { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', description: 'Latest small embedding model (1536, 1024, 768 dims)' },
        { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', description: 'Latest large embedding model (1536, 1024, 768 dims)' },
        { id: 'text-embedding-ada-002', name: 'Text Embedding Ada 002', description: 'Previous generation embedding model (1536 dims)' },
      ]
    case 'gemini':
      return [
        { id: 'embedding-001', name: 'Embedding 001', description: 'Google\'s embedding model (768 dims)' },
      ]
    case 'local':
      return [
        { id: 'local-embedding', name: 'Self-hosted Ollama embedding model', description: 'Self-hosted Ollama embedding model (1536, 1024, 768 dims)' },
      ]
    default:
      return []
  }
})

// === DIMENSION OPTIONS BASED ON MODEL ===
const availableDimensions = computed(() => {
  const selectedModel = embeddingModels.value.find(m => m.id === tempEmbeddingModel.value)
  if (!selectedModel)
    return [1536, 1024, 768]

  switch (selectedModel.id) {
    case 'text-embedding-3-small':
      return [1536, 1024, 768]
    case 'text-embedding-3-large':
      return [1536, 1024, 768]
    case 'text-embedding-ada-002':
      return [1536]
    case 'embedding-001':
      return [768]
    case 'local-embedding':
      return [1536, 1024, 768]
    default:
      return [1536, 1024, 768]
  }
})

// === SETTINGS CHANGE DETECTION ===
const settingsChanged = ref(false)
const showRegenerationWarning = ref(false)

// Watch for changes in temporary embedding settings
watch([tempEmbeddingProvider, tempEmbeddingModel, tempEmbeddingDim, tempEmbeddingApiKey], () => {
  // Check if any temporary setting differs from committed setting
  const hasChanges
    = tempEmbeddingProvider.value !== embeddingProvider.value
      || tempEmbeddingModel.value !== embeddingModel.value
      || tempEmbeddingDim.value !== embeddingDim.value
      || tempEmbeddingApiKey.value !== embeddingApiKey.value

  // Also consider it a change if we're setting initial values
  const isInitialSetup
    = (!embeddingProvider.value && tempEmbeddingProvider.value)
      || (!embeddingModel.value && tempEmbeddingModel.value)
      || (!embeddingApiKey.value && tempEmbeddingApiKey.value)

  settingsChanged.value = hasChanges || isInitialSetup
  showRegenerationWarning.value = hasChanges || isInitialSetup

  console.warn('Settings change detected:')
}, { deep: true, immediate: true })

// === FUNCTIONS ===
async function fetchSettings() {
  try {
    if (!memoryServiceEnabled.value)
      return

    const response = await fetch(`${memoryServiceUrl.value}/api/settings`, {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch settings')
    }

    const settings = await response.json()

    // Only update settings if they exist in the response
    if (settings) {
      // Update LLM settings
      llmProvider.value = settings.llmProvider || ''
      llmModel.value = settings.llmModel || ''
      llmApiKey.value = settings.llmApiKey || ''

      // Update embedding settings (both committed and temporary)
      embeddingProvider.value = settings.embeddingProvider || ''
      embeddingModel.value = settings.embeddingModel || ''
      embeddingApiKey.value = settings.embeddingApiKey || ''
      embeddingDim.value = settings.embeddingDimensions || 0

      // Sync temporary settings
      tempEmbeddingProvider.value = embeddingProvider.value
      tempEmbeddingModel.value = embeddingModel.value
      tempEmbeddingApiKey.value = embeddingApiKey.value
      tempEmbeddingDim.value = embeddingDim.value

      connectionMessage.value = 'Settings loaded from server'
      connectionMessageType.value = 'success'
    }
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    connectionMessage.value = `Failed to fetch settings: ${msg}`
    connectionMessageType.value = 'error'
    console.error(connectionMessage.value)
  }
}

async function testConnection() {
  try {
    isTesting.value = true

    const headers: Record<string, string> = {}
    if (apiKey.value.trim()) {
      headers.Authorization = `Bearer ${apiKey.value}`
    }

    const response = await fetch(`${memoryServiceUrl.value}/api/test-conn`, {
      method: 'GET',
      headers,
    })

    if (response.ok) {
      isConnected.value = true
      connectionStatus.value = 'Connected to Memory Service ✅'
      connectionMessage.value = 'Successfully connected with API key!'
      connectionMessageType.value = 'success'
      connectionError.value = ''

      // Also fetch database info now that we have a working connection
      await fetchDatabaseInfo()
    }
    else if (response.status === 401) {
      isConnected.value = false
      connectionStatus.value = 'Memory Service requires API key ❌'
      connectionMessage.value = 'Connection failed: API key required'
      connectionMessageType.value = 'error'
      connectionError.value = 'The memory service requires a valid API key for authentication'
    }
    else if (response.status === 403) {
      isConnected.value = false
      connectionStatus.value = 'Memory Service rejected API key ❌'
      connectionMessage.value = 'Connection failed: Invalid API key'
      connectionMessageType.value = 'error'
      connectionError.value = 'The provided API key is invalid or expired'
    }
    else {
      isConnected.value = false
      connectionStatus.value = 'Memory Service responded with error ❌'
      connectionMessage.value = `Connection failed: Server responded with status ${response.status}`
      connectionMessageType.value = 'error'
      connectionError.value = `HTTP ${response.status}: ${response.statusText}`
    }
  }
  catch (error) {
    isConnected.value = false
    connectionStatus.value = 'Cannot connect to Memory Service ❌'
    connectionMessage.value = 'Connection failed: Network error'
    connectionMessageType.value = 'error'
    connectionError.value = error instanceof Error ? error.message : 'Unknown connection error'
  }
  finally {
    isTesting.value = false
  }
}

function resetSettings() {
  memoryServiceEnabled.value = false
  memoryServiceUrl.value = 'http://localhost:3001'
  apiKey.value = ''
  llmProvider.value = ''
  llmModel.value = ''
  llmApiKey.value = ''
  embeddingProvider.value = ''
  embeddingModel.value = ''
  embeddingApiKey.value = ''
  embeddingDim.value = 0
  // Reset temporary settings to match committed settings
  tempEmbeddingProvider.value = embeddingProvider.value
  tempEmbeddingModel.value = embeddingModel.value
  tempEmbeddingApiKey.value = embeddingApiKey.value
  tempEmbeddingDim.value = embeddingDim.value
  connectionMessage.value = ''
  connectionError.value = ''
  connectionStatus.value = 'Settings reset to defaults'
  isConnected.value = false
  connectionMessageType.value = 'success'
  settingsChanged.value = false
  showRegenerationWarning.value = false
}

async function confirmRegeneration() {
  try {
    // Commit the temporary settings to persistent storage
    embeddingProvider.value = tempEmbeddingProvider.value
    embeddingModel.value = tempEmbeddingModel.value
    embeddingApiKey.value = tempEmbeddingApiKey.value
    embeddingDim.value = tempEmbeddingDim.value

    // Call the API to update settings and trigger regeneration
    const response = await fetch(`${memoryServiceUrl.value}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.value}`,
      },
      body: JSON.stringify({
        // LLM settings
        llmProvider: llmProvider.value,
        llmModel: llmModel.value,
        llmApiKey: llmApiKey.value,
        // llmTemperature: 7, // TODO: Maybe add settings for these
        // llmMaxTokens: 2000, // TODO: maybe add settings for these

        // Embedding settings
        embeddingProvider: embeddingProvider.value,
        embeddingModel: embeddingModel.value,
        embeddingApiKey: embeddingApiKey.value,
        embeddingDimensions: embeddingDim.value,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.details || 'Failed to update settings')
    }

    showRegenerationWarning.value = false
    settingsChanged.value = false

    // Show success message
    connectionMessage.value = 'Settings updated and embedding regeneration started'
    connectionMessageType.value = 'success'
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    connectionMessage.value = `Failed to update settings: ${msg}`
    connectionMessageType.value = 'error'
    console.error(connectionMessage.value)
  }
}

function dismissRegenerationWarning() {
  // Revert temporary settings back to committed settings
  tempEmbeddingProvider.value = embeddingProvider.value
  tempEmbeddingModel.value = embeddingModel.value
  tempEmbeddingApiKey.value = embeddingApiKey.value
  tempEmbeddingDim.value = embeddingDim.value

  showRegenerationWarning.value = false
  settingsChanged.value = false
}

async function updateDbEnabled(endpoint: 'embedded-postgres' | 'pglite', enabled: boolean) {
  try {
    const response = await fetch(`${memoryServiceUrl.value}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.value}`,
      },
      body: JSON.stringify({ enabled }),
    })
    if (!response.ok) {
      throw new Error(`Failed to update ${endpoint} status`)
    }
  }
  catch (error) {
    checkDbVariantMessage.value = `Error updating ${endpoint} status: ${error}`
    console.error(checkDbVariantMessage.value)
  }
}

watch(embeddedPostgresEnabled, (n, o) => {
  const now = n === true
  const old = o === true
  if (now && !old) {
    if (pgLiteEnabled.value)
      pgLiteEnabled.value = false
    updateDbEnabled('pglite', false)
    updateDbEnabled('embedded-postgres', true)
  }
})

watch(pgLiteEnabled, (n, o) => {
  const now = n === true
  const old = o === true
  if (now && !old) {
    if (embeddedPostgresEnabled.value)
      embeddedPostgresEnabled.value = false
    updateDbEnabled('embedded-postgres', false)
    updateDbEnabled('pglite', true)
  }
})

async function fetchDatabaseInfo() {
  try {
    if (!memoryServiceEnabled.value)
      return

    const response = await fetch(`${memoryServiceUrl.value}/api/database-url`, {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch database info')
    }

    const { dbUrl, message } = await response.json()
    currentDbUrl.value = dbUrl
    dbInfoMessage.value = message
  }
  catch (error) {
    console.error('Failed to fetch database info:', error)
    currentDbUrl.value = 'Unable to fetch database info'
    dbInfoMessage.value = 'Error connecting to memory service'
  }
}

// Watch for memory service being enabled
watch(memoryServiceEnabled, async (newValue) => {
  if (newValue) {
    await fetchSettings()
    await fetchRegenerationStatus()
    await fetchDatabaseInfo()
  }
})

onMounted(async () => {
  // Initialize temporary settings with either stored values or defaults
  tempEmbeddingProvider.value = embeddingProvider.value || 'openai'
  tempEmbeddingModel.value = embeddingModel.value || 'text-embedding-3-small'
  tempEmbeddingApiKey.value = embeddingApiKey.value
  tempEmbeddingDim.value = embeddingDim.value || 1536

  // Fetch database info when settings page opens
  if (memoryServiceEnabled.value) {
    await fetchDatabaseInfo()
  }

  // Force check for changes on mount
  const hasChanges
    = tempEmbeddingProvider.value !== embeddingProvider.value
      || tempEmbeddingModel.value !== embeddingModel.value
      || tempEmbeddingDim.value !== embeddingDim.value
      || tempEmbeddingApiKey.value !== embeddingApiKey.value

  settingsChanged.value = hasChanges
  showRegenerationWarning.value = hasChanges
})

async function importChatHistory() {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.sql,.tar,.gz,.tgz'

  fileInput.onchange = async (event) => {
    const file = (event.target as HTMLInputElement)?.files?.[0]
    if (!file) {
      importMessage.value = 'No file selected.'
      return
    }

    const name = file.name.toLowerCase()
    const isPglite = /\.(?:tar|tgz|gz)$/.test(name)

    if (!isPglite && !name.endsWith('.sql')) {
      importMessage.value = 'Unsupported file. Use .sql (Postgres) or .tar/.gz/.tgz (PGlite).'
      return
    }

    try {
      importMessage.value = 'Importing chat history...'
      const formData = new FormData()
      formData.append('file', file)

      const url = `${memoryServiceUrl.value}/api/memory/import-chathistory?isPglite=${isPglite ? 'true' : 'false'}`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.value}`,
          'X-DB-Variant': isPglite ? 'pglite' : 'pg',
        },
        body: formData,
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`Failed to import chat history: ${err}`)
      }
      importMessage.value = 'Chat history imported successfully!'
      chatStore.hasLoadedInitialHistory = false
      await chatStore.loadInitialHistory(50)
    }
    catch (error) {
      console.error(error)
      importMessage.value = `Error importing chat history: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
  fileInput.click()
}

async function exportChatHistory() {
  try {
    exportMessage.value = 'Chat export task has started...'
    const usePglite = pgLiteEnabled.value === true
    const endpoint = usePglite
      ? `${memoryServiceUrl.value}/api/memory/export-chathistory?isPglite=true`
      : `${memoryServiceUrl.value}/api/memory/export-embedded`

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.value}`,
        'X-DB-Variant': usePglite ? 'pglite' : 'pg',
      },
    })

    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(t || `HTTP ${r.status}`)
    }

    const cd = r.headers.get('content-disposition') || ''
    const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd)
    const serverName = decodeURIComponent(m?.[1] || m?.[2] || '')
    const blob = await r.blob()
    const urlObj = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = urlObj
    a.download = serverName || (usePglite
      ? `pglite_backup_${new Date().toISOString()}.tar.gz`
      : `chathistory_pg_backup_${new Date().toISOString()}.tar.gz`)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(urlObj)
    exportMessage.value = 'Chat history export completed successfully!'
  }
  catch (e: unknown) {
    exportMessage.value = `Failed to export chat history: ${e instanceof Error ? e.message : String(e)}`
  }
}
</script>

<template>
  <div flex flex-col gap-5 pb-12>
    <!-- Beta Warning -->
    <div class="border border-yellow-200 rounded-lg bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/20">
      <div class="flex items-center gap-2">
        <span class="text-yellow-800 font-semibold dark:text-yellow-200">BETA</span>
        <span class="text-sm text-yellow-700 dark:text-yellow-300">Memory service is currently in beta. Some features may be experimental or change without notice.</span>
      </div>
    </div>

    <!-- Help Info Section -->
    <div class="rounded-lg bg-primary-500/10 p-4 dark:bg-primary-800/25">
      <div class="mb-2 text-xl text-primary-800 font-semibold dark:text-primary-100">
        Memory Service Configuration
      </div>
      <div class="text-primary-700 dark:text-primary-300">
        Configure the connection to your AI memory service and set up LLM and embedding providers for intelligent message analysis and memory creation.
      </div>
    </div>

    <!-- Connection Status Section -->
    <div flex="~ row items-center gap-2">
      <div i-solar:leaf-bold-duotone text="neutral-500 dark:neutral-400 4xl" />
      <div>
        <div>
          <span text="neutral-300 dark:neutral-500">Memory Service Status</span>
        </div>
        <div flex text-nowrap text-3xl font-normal>
          <div>
            {{ connectionStatus }}
          </div>
        </div>
      </div>
    </div>

    <!-- Regeneration Warning -->
    <div v-if="showRegenerationWarning" class="border border-orange-200 rounded-lg bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/20">
      <div class="mb-2 text-lg text-orange-800 font-semibold dark:text-orange-200">
        ⚠️ Embedding Settings Changed
      </div>
      <div class="mb-3 text-sm text-orange-800 dark:text-orange-200">
        Changing embedding settings will require regenerating embeddings for all existing memories. This process may take time and consume API resources.
      </div>
      <div class="flex gap-2">
        <button
          class="rounded bg-orange-600 px-3 py-1 text-sm text-white hover:bg-orange-700"
          @click="confirmRegeneration"
        >
          Regenerate Embeddings
        </button>
        <button
          class="border border-orange-300 rounded px-3 py-1 text-sm text-orange-700 dark:border-orange-600 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-900"
          @click="dismissRegenerationWarning"
        >
          Keep Current Settings
        </button>
      </div>
    </div>

    <!-- Regeneration Progress -->
    <div v-if="isRegenerating" class="border border-blue-200 rounded-lg bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
      <div class="mb-2 text-lg text-blue-800 font-semibold dark:text-blue-200">
        🔄 Regenerating Embeddings...
      </div>

      <!-- Progress Bar -->
      <div class="mb-3 h-2 w-full rounded-full bg-blue-200 dark:bg-blue-800">
        <div
          class="h-full rounded-full bg-blue-600 transition-all duration-300 ease-in-out dark:bg-blue-400"
          :style="{ width: `${regenerationProgress}%` }"
        />
      </div>

      <!-- Progress Details -->
      <div class="text-sm text-blue-800 dark:text-blue-200">
        <div class="mb-2">
          Progress: {{ regenerationProgress }}% ({{ regenerationProcessedItems }} / {{ regenerationTotalItems }} items)
        </div>

        <div class="mb-2">
          Time remaining: {{ formatTimeRemaining(regenerationTimeRemaining) }}
        </div>

        <div class="text-xs text-blue-600 dark:text-blue-300">
          Processing {{ regenerationBatchSize }} items per batch
        </div>
      </div>
    </div>

    <!-- Service and Database Configuration Section - Two separate blocks side by side -->
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- Service Configuration Block -->
      <div class="border border-neutral-200 rounded-lg bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
        <div class="mb-4">
          <h3 class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            Service Configuration
          </h3>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            Configure the memory service connection and authentication
          </p>
        </div>

        <div class="mb-4">
          <label class="flex cursor-pointer items-center gap-3">
            <input
              v-model="memoryServiceEnabled"
              type="checkbox"
              class="h-4 w-4 border-gray-300 rounded bg-gray-100 text-blue-600 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:ring-offset-gray-800 dark:focus:ring-blue-600"
            >
            <span class="text-sm text-neutral-700 font-medium dark:text-neutral-300">
              Enable Memory Service Integration
            </span>
          </label>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            When enabled, all chat messages and AI responses will be automatically stored in the memory service
          </p>
        </div>

        <div class="mb-4">
          <label class="flex cursor-pointer items-center gap-3">
            <input
              v-model="embeddedPostgresEnabled"
              type="checkbox"
              class="h-4 w-4 border-gray-300 rounded bg-gray-100 text-blue-600 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:ring-offset-gray-800 dark:focus:ring-blue-600"
            >
            <span class="text-sm text-neutral-700 font-medium dark:text-neutral-300">
              Enable Embedded Postgres
            </span>
          </label>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Toggle the embedded Postgres database for local memory storage
          </p>
          <label class="flex cursor-pointer items-center gap-3">
            <input
              v-model="pgLiteEnabled"
              type="checkbox"
              class="h-4 w-4 border-gray-300 rounded bg-gray-100 text-blue-600 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:ring-offset-gray-800 dark:focus:ring-blue-600"
            >
            <span class="text-sm text-neutral-700 font-medium dark:text-neutral-300">
              Enable PGLite
            </span>
          </label>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Toggle the PGLite database for local memory storage (Recommended)
          </p>
          <!-- Embedded Postgres Export -->
          <div class="mt-4">
            <div class="mt-2">
              <button class="btn btn-warning" @click="exportChatHistory">
                Export Chat History
              </button>
            </div>
            <p v-if="exportMessage" class="mt-1 text-blue-600">
              {{ exportMessage }}
            </p>
            <div class="mt-2">
              <button class="btn btn-warning" @click="importChatHistory">
                Import Chat History
              </button>
            </div>
            <p v-if="importMessage" class="mt-1 text-blue-600">
              {{ importMessage }}
            </p>
          </div>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Memory Service URL (default: http://localhost:3001)
          </label>
          <FieldInput
            v-model="memoryServiceUrl"
            placeholder="http://localhost:3001"
            class="w-full"
            :disabled="!memoryServiceEnabled"
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            The URL where your memory service is running
          </p>
        </div>
        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Server Password (Optional)
          </label>
          <FieldInput
            v-model="apiKey"
            type="password"
            placeholder="Enter server password if authentication is required"
            class="w-full"
            :disabled="!memoryServiceEnabled"
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Leave empty if no authentication is required
          </p>
        </div>

        <div class="flex gap-2">
          <button
            class="w-full rounded-lg bg-neutral-200 px-4 py-2 transition-colors sm:w-auto disabled:cursor-not-allowed dark:bg-neutral-700 hover:bg-neutral-300 disabled:opacity-50 dark:hover:bg-neutral-600"
            :disabled="!memoryServiceEnabled || isTesting"
            @click="testConnection"
          >
            {{ isTesting ? 'Testing...' : 'Test Connection' }}
          </button>

          <button
            class="w-full border border-neutral-300 rounded-lg px-4 py-2 transition-colors sm:w-auto disabled:cursor-not-allowed dark:border-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-700"
            :disabled="!memoryServiceEnabled"
            @click="resetSettings"
          >
            Reset to Defaults
          </button>
        </div>

        <div v-if="connectionMessage" class="mt-2 text-sm" :class="connectionMessageType === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          {{ connectionMessage }}
        </div>

        <div v-if="connectionError" class="mt-2 text-sm text-red-600 dark:text-red-400">
          {{ connectionError }}
        </div>
      </div>

      <!-- Database Connection Info -->
      <div class="border border-neutral-200 rounded-lg bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
        <div class="mb-4">
          <h3 class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            Database Connection
          </h3>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            Current database connection information
          </p>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Current Database URL
          </label>
          <div class="rounded-md bg-neutral-50 p-3 dark:bg-neutral-700">
            <code class="break-all text-sm text-neutral-800 dark:text-neutral-200">
              {{ currentDbUrl || 'Loading...' }}
            </code>
          </div>
          <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {{ dbInfoMessage }}
          </p>
          <div class="mt-3 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
            <p class="text-sm text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> To change the database connection, update the <code>DATABASE_URL</code> environment variable in the memory service's <code>.env</code> file and restart the service.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Configuration Section Title -->
    <div class="mb-4">
      <h2 class="text-xl text-neutral-900 font-semibold dark:text-neutral-100">
        AI Configuration
      </h2>
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        Configure language models and embedding providers for memory analysis
      </p>
    </div>

    <!-- AI Configuration Section - Two separate blocks side by side -->
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- LLM Configuration Block -->
      <div class="border border-neutral-200 rounded-lg bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
        <div class="mb-4">
          <h3 class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            Language Model (LLM)
          </h3>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            For memory analysis and processing
          </p>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Provider
          </label>
          <div class="grid grid-cols-1 gap-2">
            <RadioCardSimple
              v-for="provider in llmProviders"
              :id="provider.value"
              :key="provider.value"
              v-model="llmProvider"
              name="llm-provider"
              :value="provider.value"
              :title="provider.label"
              :description="provider.description"
            />
          </div>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Model
          </label>
          <RadioCardManySelect
            v-model="llmModel"
            :items="llmModels"
            :searchable="true"
            search-placeholder="Search models..."
            search-no-results-title="No models found"
            search-no-results-description="Try a different search term"
            search-results-text="{count} of {total} models"
            :show-more="false"
            list-class="max-h-48"
          />
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            API Key
          </label>
          <FieldInput
            v-model="llmApiKey"
            type="password"
            placeholder="Enter your LLM provider API key"
            class="w-full"
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Required for OpenAI and Gemini providers
          </p>
        </div>
      </div>

      <!-- Embedding Configuration Block -->
      <div class="border border-neutral-200 rounded-lg bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
        <div class="mb-4">
          <h3 class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            Embedding Model
          </h3>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            For semantic search and memory retrieval
          </p>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Provider
          </label>
          <div class="grid grid-cols-1 gap-2">
            <RadioCardSimple
              v-for="provider in embeddingProviders"
              :id="provider.value"
              :key="provider.value"
              v-model="tempEmbeddingProvider"
              name="embedding-provider"
              :value="provider.value"
              :title="provider.label"
              :description="provider.description"
            />
          </div>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Model
          </label>
          <RadioCardManySelect
            v-model="tempEmbeddingModel"
            :items="embeddingModels"
            :searchable="true"
            search-placeholder="Search embedding models..."
            search-no-results-title="No models found"
            search-no-results-description="Try a different search term"
            search-results-text="{count} of {total} models"
            :show-more="false"
            list-class="max-h-48"
          />
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            API Key
          </label>
          <FieldInput
            v-model="tempEmbeddingApiKey"
            type="password"
            placeholder="Enter your embedding provider API key"
            class="w-full"
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Required for OpenAI and Gemini providers
          </p>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Dimension
          </label>
          <div class="grid grid-cols-3 gap-2">
            <RadioCardSimple
              v-for="dim in availableDimensions"
              :id="`dim-${dim}`"
              :key="dim"
              v-model="tempEmbeddingDimStr"
              class="max-w-[3.5rem]"
              name="embedding-dimension"
              :value="String(dim)"
              :title="`${dim}D`"
              :description="`${dim} dims`"
            />
          </div>
          <p class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Higher dimensions = better accuracy, more storage
          </p>
        </div>
      </div>
    </div>

    <!-- Configuration Info Section -->
    <div class="border border-neutral-200 rounded-lg bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
      <div class="mb-4">
        <h3 class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
          How It Works
        </h3>
        <p class="text-sm text-neutral-600 dark:text-neutral-400">
          The memory service automatically processes messages and creates structured memory data:
        </p>
      </div>

      <ul class="list-disc list-inside text-sm text-neutral-600 space-y-2 dark:text-neutral-400">
        <li>Messages are ingested and stored in the database</li>
        <li>Background processing analyzes content using your configured LLM provider</li>
        <li>Embeddings are generated using your configured embedding provider for semantic search</li>
        <li>Structured data (fragments, goals, ideas, tags) is automatically created</li>
        <li>Memory consolidation algorithms strengthen or weaken memories over time</li>
      </ul>
    </div>

    <!-- Settings Persistence Info -->
    <div class="border border-green-200 rounded-lg bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
      <div class="mb-2 text-green-900 font-medium dark:text-green-100">
        ✓ Settings Persistence
      </div>
      <div class="text-sm text-green-800 dark:text-green-200">
        All settings are automatically saved to your browser's local storage and will persist across sessions.
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
