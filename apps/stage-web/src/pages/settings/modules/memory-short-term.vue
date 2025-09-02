<script setup lang="ts">
import { Alert, Button, ErrorContainer } from '@proj-airi/stage-ui/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Состояния для mem0
const mem0BaseUrl = ref('http://localhost:8002')
const mem0Connected = ref(false)
const mem0Testing = ref(false)
const mem0Error = ref<string | null>(null)

// Интерфейс для работы с памятью
const searchQuery = ref('')
const searchResults = ref<Array<{ id: string, text: string, metadata: any, timestamp: string }>>([])
const isSearching = ref(false)
const searchError = ref<string | null>(null)

const newMemory = ref('')
const isAddingMemory = ref(false)
const addMemoryError = ref<string | null>(null)

// Настройки mem0
const memorySettings = ref({
  user_id: 'airi-user',
  retention_days: 30,
  max_memories: 1000,
})

// Тестирование соединения с mem0
async function testMem0Connection() {
  mem0Testing.value = true
  mem0Error.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/health`)

    if (response.ok) {
      mem0Connected.value = true
      await loadRecentMemories()
    }
    else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }
  catch (error) {
    console.error('mem0 connection test error:', error)
    mem0Error.value = error instanceof Error ? error.message : 'Не удалось подключиться к mem0'
    mem0Connected.value = false
  }
  finally {
    mem0Testing.value = false
  }
}

// Загрузка последних записей памяти
async function loadRecentMemories() {
  isSearching.value = true
  searchError.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/v1/memories`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    searchResults.value = data.memories || []
  }
  catch (error) {
    console.error('Error loading memories:', error)
    searchError.value = error instanceof Error ? error.message : 'Ошибка загрузки памяти'
  }
  finally {
    isSearching.value = false
  }
}

// Поиск в памяти
async function searchMemories() {
  if (!searchQuery.value.trim()) {
    await loadRecentMemories()
    return
  }

  isSearching.value = true
  searchError.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/v1/memories/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery.value,
        user_id: memorySettings.value.user_id,
        limit: 20,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    searchResults.value = data.results || []
  }
  catch (error) {
    console.error('Search error:', error)
    searchError.value = error instanceof Error ? error.message : 'Ошибка поиска'
  }
  finally {
    isSearching.value = false
  }
}

// Добавление новой записи в память
async function addMemory() {
  if (!newMemory.value.trim())
    return

  isAddingMemory.value = true
  addMemoryError.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: newMemory.value,
          },
        ],
        user_id: memorySettings.value.user_id,
        metadata: {
          source: 'manual_input',
          timestamp: new Date().toISOString(),
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    newMemory.value = ''
    await loadRecentMemories()
  }
  catch (error) {
    console.error('Add memory error:', error)
    addMemoryError.value = error instanceof Error ? error.message : 'Ошибка добавления записи'
  }
  finally {
    isAddingMemory.value = false
  }
}

// Удаление записи из памяти
async function deleteMemory(memoryId: string) {
  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/v1/memories/${memoryId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    await loadRecentMemories()
  }
  catch (error) {
    console.error('Delete memory error:', error)
    searchError.value = error instanceof Error ? error.message : 'Ошибка удаления записи'
  }
}

onMounted(() => {
  testMem0Connection()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl text-gray-900 font-bold dark:text-white">
        {{ t('settings.pages.modules.memory-short-term.title') }}
      </h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        {{ t('settings.pages.modules.memory-short-term.description') }}
      </p>
    </div>

    <!-- Connection Settings -->
    <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <h2 class="mb-4 text-lg text-gray-900 font-medium dark:text-white">
        Настройки mem0
      </h2>

      <div class="space-y-4">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            URL сервера mem0
          </label>
          <div class="flex space-x-3">
            <input
              v-model="mem0BaseUrl"
              type="url"
              class="flex-1 border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
              placeholder="http://localhost:8002"
            >
            <Button
              :disabled="mem0Testing"
              @click="testMem0Connection"
            >
              <div v-if="mem0Testing" class="mr-2 h-4 w-4 animate-spin">
                <div class="i-solar:loading-bold-duotone" />
              </div>
              {{ mem0Testing ? 'Тестирую...' : 'Тест' }}
            </Button>
          </div>
        </div>

        <!-- Connection Status -->
        <div v-if="mem0Connected" class="rounded-md bg-green-50 p-3 dark:bg-green-900/20">
          <div class="flex">
            <div class="i-solar:check-circle-bold h-4 w-4 text-green-400" />
            <div class="ml-2">
              <p class="text-sm text-green-800 dark:text-green-200">
                Соединение с mem0 установлено
              </p>
            </div>
          </div>
        </div>

        <ErrorContainer v-if="mem0Error" title="Ошибка соединения" :error="mem0Error" />
      </div>
    </div>

    <!-- Memory Management -->
    <div v-if="mem0Connected" class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <h2 class="mb-4 text-lg text-gray-900 font-medium dark:text-white">
        Управление памятью
      </h2>

      <!-- Add New Memory -->
      <div class="mb-6 space-y-4">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            Добавить запись в память
          </label>
          <div class="flex space-x-3">
            <textarea
              v-model="newMemory"
              rows="2"
              class="flex-1 border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
              placeholder="Введите информацию для сохранения в памяти..."
            />
            <Button
              :disabled="isAddingMemory || !newMemory.trim()"
              @click="addMemory"
            >
              <div v-if="isAddingMemory" class="mr-2 h-4 w-4 animate-spin">
                <div class="i-solar:loading-bold-duotone" />
              </div>
              {{ isAddingMemory ? 'Добавляю...' : 'Добавить' }}
            </Button>
          </div>
        </div>

        <ErrorContainer v-if="addMemoryError" title="Ошибка добавления" :error="addMemoryError" />
      </div>

      <!-- Search Memories -->
      <div class="space-y-4">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            Поиск в памяти
          </label>
          <div class="flex space-x-3">
            <input
              v-model="searchQuery"
              type="text"
              class="flex-1 border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
              placeholder="Введите поисковый запрос..."
              @keyup.enter="searchMemories"
            >
            <Button
              :disabled="isSearching"
              @click="searchMemories"
            >
              <div v-if="isSearching" class="mr-2 h-4 w-4 animate-spin">
                <div class="i-solar:loading-bold-duotone" />
              </div>
              {{ isSearching ? 'Ищу...' : 'Поиск' }}
            </Button>
          </div>
        </div>

        <ErrorContainer v-if="searchError" title="Ошибка поиска" :error="searchError" />

        <!-- Search Results -->
        <div v-if="searchResults.length > 0" class="space-y-3">
          <h3 class="text-md text-gray-900 font-medium dark:text-white">
            Результаты ({{ searchResults.length }})
          </h3>

          <div class="space-y-2">
            <div
              v-for="result in searchResults"
              :key="result.id"
              class="border border-gray-200 rounded-lg p-4 dark:border-gray-700"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <p class="text-sm text-gray-900 dark:text-white">
                    {{ result.text }}
                  </p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ new Date(result.timestamp).toLocaleString() }}
                  </p>
                </div>
                <button
                  type="button"
                  class="ml-3 inline-flex items-center border border-gray-300 rounded bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-50 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:hover:bg-gray-600"
                  @click="deleteMemory(result.id)"
                >
                  <div class="i-solar:trash-bin-2-bold-duotone h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!isSearching && mem0Connected" class="py-8 text-center">
          <div class="i-solar:inbox-bold-duotone mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p class="text-gray-500 dark:text-gray-400">
            {{ searchQuery ? 'Записи не найдены' : 'Нет записей в памяти' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Instructions -->
    <Alert type="info">
      <template #title>
        Настройка кратковременной памяти
      </template>
      <template #content>
        <div class="space-y-2">
          <p>Для работы модуля кратковременной памяти необходимо:</p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Установить и запустить mem0 сервер</li>
            <li>Указать правильный URL сервера (по умолчанию http://localhost:8002)</li>
            <li>Убедиться, что сервер доступен и отвечает на запросы</li>
          </ul>
          <p class="mt-2">
            Подробная документация по установке mem0:
            <a href="https://github.com/mem0ai/mem0" target="_blank" class="text-primary-600 hover:text-primary-500">
              github.com/mem0ai/mem0
            </a>
          </p>
        </div>
      </template>
    </Alert>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
