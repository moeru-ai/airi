<script setup lang="ts">
import { RadioCardManySelect, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useMemoryService } from '@proj-airi/stage-ui/composables/useMemoryService'
import { exportChatHistory as exportLocalChatHistory, importChatHistory as importLocalChatHistory, testLocalMemoryConnection } from '@proj-airi/stage-ui/services'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { FieldInput } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'

// === EXISTING MEMORY SERVICE SETTINGS ===
const memoryServiceEnabled = useLocalStorage('settings/memory/enabled', true)
const chatStore = useChatStore()
const { getActiveModelName } = useMemoryService()
const memoryServiceUrl = useLocalStorage('settings/memory/service-url', 'local://pglite')
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
  isRegenerating.value = false
  regenerationProgress.value = 100
  regenerationTotalItems.value = 0
  regenerationProcessedItems.value = 0
  regenerationTimeRemaining.value = null
  regenerationBatchSize.value = 0
}

// === LLM CONFIGURATION SETTINGS (Set explicit defaults for XsaiLLMProvider stability) ===
const llmProvider = useLocalStorage('settings/memory/llm-provider', 'openai')
const llmModel = useLocalStorage('settings/memory/llm-model', 'gpt-4-turbo-preview')
const llmApiKey = useLocalStorage('settings/memory/llm-api-key', '')

// === EMBEDDING CONFIGURATION SETTINGS ===
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

// === PROVIDER OPTIONS (Labels updated to reflect Xsai consolidation) ===
const llmProviders = [
  { value: 'openai', label: 'OpenAI (via Xsai)', description: 'GPT models via unified Xsai provider' },
  { value: 'gemini', label: 'Google Gemini (via Xsai)', description: 'Gemini models via unified Xsai provider' },
  { value: 'local', label: 'Ollama (via Xsai)', description: 'Self-hosted Ollama models via unified Xsai provider' },
]

const embeddingProviders = [
  { value: 'openai', label: 'OpenAI (via Xsai)', description: 'Text embedding models via unified Xsai provider' },
  { value: 'gemini', label: 'Google Gemini (via Xsai)', description: 'Embedding models via unified Xsai provider' },
  { value: 'local', label: 'Ollama (via Xsai)', description: 'Self-hosted Ollama embedding models via unified Xsai provider' },
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

// Watch for changes in all LLM and temporary embedding settings
watch([
  llmProvider,
  llmModel,
  llmApiKey,
  tempEmbeddingProvider,
  tempEmbeddingModel,
  tempEmbeddingDim,
  tempEmbeddingApiKey,
], () => {
  // 1. Check for embedding changes (Triggers Regeneration Warning)
  const hasEmbeddingChanges
    = tempEmbeddingProvider.value !== embeddingProvider.value
      || tempEmbeddingModel.value !== embeddingModel.value
      || tempEmbeddingDim.value !== embeddingDim.value
      || tempEmbeddingApiKey.value !== embeddingApiKey.value

  const tempLlmProvider = llmProvider.value
  const tempLlmModel = llmModel.value
  const tempLlmApiKey = llmApiKey.value
  const hasLLMChanges
    = tempLlmProvider.value !== useLocalStorage('settings/memory/llm-provider', 'openai').value
      || tempLlmModel.value !== useLocalStorage('settings/memory/llm-model', 'gpt-4-turbo-preview').value
      || tempLlmApiKey.value !== useLocalStorage('settings/memory/llm-api-key', '').value

  settingsChanged.value = hasEmbeddingChanges || hasLLMChanges
  showRegenerationWarning.value = hasEmbeddingChanges

  console.warn('Settings change detected. Requires embedding regeneration:', hasEmbeddingChanges)
}, { deep: true, immediate: true })

// === FUNCTIONS ===
async function fetchSettings() {
  if (!memoryServiceEnabled.value)
    return

  // Ensure temporary settings mirror committed values
  tempEmbeddingProvider.value = embeddingProvider.value
  tempEmbeddingModel.value = embeddingModel.value
  tempEmbeddingApiKey.value = embeddingApiKey.value
  tempEmbeddingDim.value = embeddingDim.value

  connectionMessage.value = 'Using embedded memory configuration'
  connectionMessageType.value = 'success'
}

async function testConnection() {
  try {
    isTesting.value = true
    await testLocalMemoryConnection()
    isConnected.value = true
    connectionStatus.value = 'Embedded Memory Ready ✅'
    connectionMessage.value = 'Local PGlite memory initialized successfully'
    connectionMessageType.value = 'success'
    connectionError.value = ''

    await fetchDatabaseInfo()
  }
  catch (error) {
    isConnected.value = false
    connectionStatus.value = 'Embedded Memory Not Available ❌'
    connectionMessage.value = 'Connection failed: Unable to initialize local memory'
    connectionMessageType.value = 'error'
    connectionError.value = error instanceof Error ? error.message : 'Unknown connection error'
  }
  finally {
    isTesting.value = false
  }
}

function resetSettings() {
  memoryServiceEnabled.value = false
  memoryServiceUrl.value = 'local://pglite'
  apiKey.value = ''
  // Use explicit, non-empty defaults to satisfy LLMProvider's non-fallback requirement
  llmProvider.value = 'openai'
  llmModel.value = 'gpt-4-turbo-preview'
  llmApiKey.value = ''

  embeddingProvider.value = 'openai'
  embeddingModel.value = 'text-embedding-3-small'
  embeddingApiKey.value = ''
  embeddingDim.value = 1536

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
    // LLM settings and Embedding settings are bundled for persistence
    const settingsToCommit = {
      // LLM settings
      llmProvider: llmProvider.value,
      llmModel: llmModel.value,
      llmApiKey: llmApiKey.value,
      // Embedding settings (from temporary values)
      embeddingProvider: tempEmbeddingProvider.value,
      embeddingModel: tempEmbeddingModel.value,
      embeddingApiKey: tempEmbeddingApiKey.value,
      embeddingDimensions: tempEmbeddingDim.value,
    }

    // Commit the temporary embedding settings to persistent storage
    embeddingProvider.value = settingsToCommit.embeddingProvider
    embeddingModel.value = settingsToCommit.embeddingModel
    embeddingApiKey.value = settingsToCommit.embeddingApiKey
    embeddingDim.value = settingsToCommit.embeddingDimensions

    showRegenerationWarning.value = false
    settingsChanged.value = false

    // Show success message
    connectionMessage.value = 'Settings updated for embedded memory'
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

watch(embeddedPostgresEnabled, (n, o) => {
  const now = n === true
  const old = o === true
  if (now && !old) {
    embeddedPostgresEnabled.value = false
    checkDbVariantMessage.value = 'Embedded Postgres is not supported when memory runs inside the app. Falling back to PGLite.'
  }
})

watch(pgLiteEnabled, (n, o) => {
  const now = n === true
  const old = o === true
  if (now && !old) {
    checkDbVariantMessage.value = 'PGLite is active and backing the embedded memory store.'
  }
  else if (!now && old) {
    pgLiteEnabled.value = true
    checkDbVariantMessage.value = 'PGLite is required for embedded memory and has been re-enabled.'
  }
})

async function fetchDatabaseInfo() {
  if (!memoryServiceEnabled.value)
    return

  currentDbUrl.value = 'Embedded PGlite (IndexedDB)'
  dbInfoMessage.value = 'Chat history is stored locally in your browser via IndexedDB.'
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
  memoryServiceUrl.value = 'local://pglite'
  pgLiteEnabled.value = true
  embeddedPostgresEnabled.value = false

  // Initialize LLM settings to non-empty defaults for factory stability
  if (!llmProvider.value)
    llmProvider.value = 'openai'
  if (!llmModel.value)
    llmModel.value = 'gpt-4-turbo-preview'

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
  fileInput.accept = '.json'

  fileInput.onchange = async (event) => {
    const file = (event.target as HTMLInputElement)?.files?.[0]
    if (!file) {
      importMessage.value = 'No file selected.'
      return
    }

    try {
      importMessage.value = 'Importing chat history...'
      const text = await file.text()
      const payload = JSON.parse(text)
      await importLocalChatHistory(payload)
      importMessage.value = 'Chat history imported successfully!'
      // use exceptionally big value to retain recent contexts!
      await chatStore.loadAllHistoryPaginated()
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
    exportMessage.value = 'Preparing chat history export...'
    const payload = await exportLocalChatHistory(getActiveModelName())
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const urlObj = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = urlObj
    a.download = `airi-memory-export-${new Date().toISOString()}.json`
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
    <div class="border border-yellow-200 rounded-lg bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/20">
      <div class="flex items-center gap-2">
        <span class="text-yellow-800 font-semibold dark:text-yellow-200">BETA</span>
        <span class="text-sm text-yellow-700 dark:text-yellow-300">Memory service is currently in beta. Some features may be experimental or change without notice.</span>
      </div>
    </div>

    <div class="rounded-lg bg-primary-500/10 p-4 dark:bg-primary-800/25">
      <div class="mb-2 text-xl text-primary-800 font-semibold dark:text-primary-100">
        Memory Service Configuration
      </div>
      <div class="text-primary-700 dark:text-primary-300">
        Configure the connection to your AI memory service and set up LLM and embedding providers for intelligent message analysis and memory creation.
      </div>
    </div>

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

    <div v-if="isRegenerating" class="border border-blue-200 rounded-lg bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
      <div class="mb-2 text-lg text-blue-800 font-semibold dark:text-blue-200">
        🔄 Regenerating Embeddings...
      </div>

      <div class="mb-3 h-2 w-full rounded-full bg-blue-200 dark:bg-blue-800">
        <div
          class="h-full rounded-full bg-blue-600 transition-all duration-300 ease-in-out dark:bg-blue-400"
          :style="{ width: `${regenerationProgress}%` }"
        />
      </div>

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

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
            Embedded Memory Endpoint
          </label>
          <FieldInput
            v-model="memoryServiceUrl"
            placeholder="local://pglite"
            class="w-full"
            disabled
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Memory now runs inside the app via PGlite. This endpoint is fixed.
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
            disabled
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Not used for embedded memory mode
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

    <div class="mb-4">
      <h2 class="text-xl text-neutral-900 font-semibold dark:text-neutral-100">
        AI Configuration
      </h2>
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        Configure language models and embedding providers for memory analysis
      </p>
    </div>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
