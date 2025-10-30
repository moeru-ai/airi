<script setup lang="ts">
import { IconItem } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const resolveAnimation = ref<() => void>()
const { t } = useI18n()

const settingsStore = useSettings()

const removeBeforeEach = router.beforeEach(async (_, __, next) => {
  if (!settingsStore.usePageSpecificTransitions || settingsStore.disableTransitions) {
    next()
    return
  }
  catch (error) {
    console.error('Failed to fetch regeneration status:', error)
  }
}

// === LLM CONFIGURATION SETTINGS (Set explicit defaults for Xsai LLMProvider stability) ===
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
    = tempLlmProvider !== useLocalStorage('settings/memory/llm-provider', 'openai').value
      || tempLlmModel !== useLocalStorage('settings/memory/llm-model', 'gpt-4-turbo-preview').value
      || tempLlmApiKey !== useLocalStorage('settings/memory/llm-api-key', '').value

  settingsChanged.value = hasEmbeddingChanges || hasLLMChanges
  showRegenerationWarning.value = hasEmbeddingChanges

  console.warn('Settings change detected. Requires embedding regeneration:', hasEmbeddingChanges)
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
      // Use explicit, non-empty defaults to avoid LLMProvider constructor failure
      llmProvider.value = settings.llmProvider || 'openai'
      llmModel.value = settings.llmModel || 'gpt-4-turbo-preview'
      llmApiKey.value = settings.llmApiKey || ''

      // Update embedding settings (both committed and temporary)
      embeddingProvider.value = settings.embeddingProvider || 'openai'
      embeddingModel.value = settings.embeddingModel || 'text-embedding-3-small'
      embeddingApiKey.value = settings.embeddingApiKey || ''
      embeddingDim.value = settings.embeddingDimensions || 1536

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

    // Call the API to update settings and trigger regeneration
    const response = await fetch(`${memoryServiceUrl.value}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.value}`,
      },
      body: JSON.stringify({
        // Transmit all settings, including the LLM settings that were just updated
        llmProvider: settingsToCommit.llmProvider,
        llmModel: settingsToCommit.llmModel,
        llmApiKey: settingsToCommit.llmApiKey,
        embeddingProvider: settingsToCommit.embeddingProvider,
        embeddingModel: settingsToCommit.embeddingModel,
        embeddingApiKey: settingsToCommit.embeddingApiKey,
        embeddingDimensions: settingsToCommit.embeddingDimensions,
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

async function updateDbEnabled(endpoint: 'chat-postgres' | 'pglite', enabled: boolean) {
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

watch(chatPostgresEnabled, (n, o) => {
  const now = n === true
  const old = o === true
  if (now && !old) {
    if (pgLiteEnabled.value)
      pgLiteEnabled.value = false
    updateDbEnabled('pglite', false)
    updateDbEnabled('chat-postgres', true)
  }
})

watch(pgLiteEnabled, (n, o) => {
  const now = n === true
  const old = o === true
  if (now && !old) {
    if (chatPostgresEnabled.value)
      chatPostgresEnabled.value = false
    updateDbEnabled('chat-postgres', false)
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
    exportMessage.value = 'Chat export task has started...'
    const usePglite = pgLiteEnabled.value === true
    const endpoint = usePglite
      ? `${memoryServiceUrl.value}/api/memory/export-chathistory?isPglite=true`
      : `${memoryServiceUrl.value}/api/memory/export-chat`

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
      ? `pglite_backup_${new Date().toISOString()}.sql`
      : `chathistory_pg_backup_${new Date().toISOString()}.sql`)
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
  <div flex="~ col gap-4" font-normal>
    <div />
    <div flex="~ col gap-4" pb-12>
      <IconItem
        v-for="(setting, index) in settings"
        :key="setting.to"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :style="{
          transitionDelay: `${index * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
        }"
        :title="setting.title"
        :description="setting.description"
        :icon="setting.icon"
        :to="setting.to"
      />
    </div>
    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[calc(100dvh-12rem)]" bottom-0 right--10 z--1
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
      size-60
      flex items-center justify-center
    >
      <div v-motion text="60" i-solar:settings-bold-duotone />
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
