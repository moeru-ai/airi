<script setup lang="ts">
import { Alert, Button, ErrorContainer } from '@proj-airi/stage-ui/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Состояния для mem0 долговременной памяти
const mem0BaseUrl = ref('http://localhost:8002')
const mem0Connected = ref(false)
const mem0Testing = ref(false)
const mem0Error = ref<string | null>(null)

// Интерфейс для работы с долговременной памятью
const searchQuery = ref('')
const longTermMemories = ref<Array<{ id: string, text: string, metadata: any, timestamp: string, importance: number }>>([])
const isSearching = ref(false)
const searchError = ref<string | null>(null)

const newMemory = ref('')
const memoryImportance = ref(8) // важность от 1 до 10, по умолчанию 8 для долговременной
const isAddingMemory = ref(false)
const addMemoryError = ref<string | null>(null)

// Настройки mem0 для долговременной памяти
const longTermSettings = ref({
  user_id: 'airi-user-longterm',
  retention_days: 365, // долговременная память на год
  max_memories: 10000,
  min_importance: 7, // только важные воспоминания
})

// Тестирование соединения с mem0
async function testMem0Connection() {
  mem0Testing.value = true
  mem0Error.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/health`)

    if (response.ok) {
      mem0Connected.value = true
      await loadLongTermMemories()
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

// Загрузка долговременных воспоминаний
async function loadLongTermMemories() {
  isSearching.value = true
  searchError.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/api/memories/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: longTermSettings.value.user_id,
        query: '',
        limit: 20,
        filters: { min_importance: longTermSettings.value.min_importance },
      }),
    })

    if (response.ok) {
      const data = await response.json()
      longTermMemories.value = data.memories || []
    }
    else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }
  catch (error) {
    console.error('Ошибка загрузки воспоминаний:', error)
    searchError.value = error instanceof Error ? error.message : 'Не удалось загрузить воспоминания'
  }
  finally {
    isSearching.value = false
  }
}

// Поиск в долговременной памяти
async function searchMemories() {
  if (!searchQuery.value.trim()) {
    await loadLongTermMemories()
    return
  }

  isSearching.value = true
  searchError.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/api/memories/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: longTermSettings.value.user_id,
        query: searchQuery.value,
        limit: 20,
        filters: { min_importance: longTermSettings.value.min_importance },
      }),
    })

    if (response.ok) {
      const data = await response.json()
      longTermMemories.value = data.memories || []
    }
    else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }
  catch (error) {
    console.error('Ошибка поиска:', error)
    searchError.value = error instanceof Error ? error.message : 'Ошибка поиска'
  }
  finally {
    isSearching.value = false
  }
}

// Добавление нового важного воспоминания
async function addLongTermMemory() {
  if (!newMemory.value.trim())
    return

  isAddingMemory.value = true
  addMemoryError.value = null

  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/api/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: longTermSettings.value.user_id,
        text: newMemory.value,
        metadata: {
          importance: memoryImportance.value,
          type: 'long_term',
          created_by: 'manual',
        },
      }),
    })

    if (response.ok) {
      newMemory.value = ''
      await loadLongTermMemories()
    }
    else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }
  catch (error) {
    console.error('Ошибка добавления воспоминания:', error)
    addMemoryError.value = error instanceof Error ? error.message : 'Ошибка добавления воспоминания'
  }
  finally {
    isAddingMemory.value = false
  }
}

// Удаление воспоминания
async function deleteMemory(memoryId: string) {
  try {
    const response = await fetch(`${mem0BaseUrl.value.trim().replace(/\/+$/, '')}/api/memories/${memoryId}`, {
      method: 'DELETE',
    })

    if (response.ok) {
      await loadLongTermMemories()
    }
    else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }
  catch (error) {
    console.error('Ошибка удаления воспоминания:', error)
    searchError.value = error instanceof Error ? error.message : 'Ошибка удаления воспоминания'
  }
}

// Форматирование важности
function getImportanceColor(importance: number): string {
  if (importance >= 9)
    return 'text-red-600 dark:text-red-400'
  if (importance >= 8)
    return 'text-orange-600 dark:text-orange-400'
  if (importance >= 7)
    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-gray-600 dark:text-gray-400'
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
        {{ t('settings.pages.modules.memory-long-term.title') }}
      </h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        {{ t('settings.pages.modules.memory-long-term.description') }}
      </p>
    </div>

    <!-- Connection Settings -->
    <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <h2 class="mb-4 text-lg text-gray-900 font-medium dark:text-white">
        Настройки mem0 (Долговременная память)
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
                Соединение с mem0 установлено (Долговременная память)
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
        Управление долговременной памятью
      </h2>

      <!-- Add New Memory -->
      <div class="mb-6 space-y-4">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            Добавить важное воспоминание
          </label>
          <div class="space-y-3">
            <textarea
              v-model="newMemory"
              rows="3"
              class="w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
              placeholder="Опишите важное событие, факт или информацию для долговременного хранения..."
            />
            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <label class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  Важность:
                </label>
                <input
                  v-model.number="memoryImportance"
                  type="range"
                  min="7"
                  max="10"
                  class="w-20"
                >
                <span class="text-sm text-gray-600 dark:text-gray-400">{{ memoryImportance }}</span>
              </div>
              <Button
                :disabled="isAddingMemory || !newMemory.trim()"
                @click="addLongTermMemory"
              >
                <div v-if="isAddingMemory" class="mr-2 h-4 w-4 animate-spin">
                  <div class="i-solar:loading-bold-duotone" />
                </div>
                {{ isAddingMemory ? 'Добавляю...' : 'Добавить в долговременную память' }}
              </Button>
            </div>
          </div>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Только важные воспоминания (важность 7+) сохраняются в долговременной памяти
          </p>
        </div>

        <ErrorContainer v-if="addMemoryError" title="Ошибка добавления" :error="addMemoryError" />
      </div>

      <!-- Search Memories -->
      <div class="space-y-4">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            Поиск в долговременной памяти
          </label>
          <div class="flex space-x-3">
            <input
              v-model="searchQuery"
              type="text"
              class="flex-1 border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
              placeholder="Поиск важных воспоминаний..."
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

        <!-- Memory Results -->
        <div v-if="longTermMemories.length > 0" class="space-y-3">
          <h3 class="text-md text-gray-900 font-medium dark:text-white">
            Долговременные воспоминания ({{ longTermMemories.length }})
          </h3>

          <div class="space-y-3">
            <div
              v-for="memory in longTermMemories"
              :key="memory.id"
              class="border border-gray-200 rounded-lg p-4 dark:border-gray-700"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="mb-2 flex items-center space-x-2">
                    <span
                      :class="getImportanceColor(memory.importance)"
                      class="text-xs font-medium"
                    >
                      Важность: {{ memory.importance }}/10
                    </span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {{ new Date(memory.timestamp).toLocaleString() }}
                    </span>
                  </div>
                  <p class="text-gray-900 dark:text-white">
                    {{ memory.text }}
                  </p>
                  <div v-if="memory.metadata" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    <span v-if="memory.metadata.type">Тип: {{ memory.metadata.type }}</span>
                    <span v-if="memory.metadata.created_by" class="ml-3">Источник: {{ memory.metadata.created_by }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="ml-3 inline-flex items-center border border-gray-300 rounded bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-50 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:hover:bg-gray-600"
                  @click="deleteMemory(memory.id)"
                >
                  <div class="i-solar:trash-bin-2-bold-duotone h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!isSearching && mem0Connected" class="py-8 text-center">
          <div class="i-solar:brain-bold-duotone mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p class="text-gray-500 dark:text-gray-400">
            {{ searchQuery ? 'Воспоминания не найдены' : 'Нет воспоминаний в долговременной памяти' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Instructions -->
    <Alert type="info">
      <template #title>
        Настройка долговременной памяти
      </template>
      <template #content>
        <div class="space-y-2">
          <p>Для работы модуля долговременной памяти необходимо:</p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Установить и запустить mem0 сервер</li>
            <li>Указать правильный URL сервера (по умолчанию http://localhost:8002)</li>
            <li>Убедиться, что сервер поддерживает API для работы с памятью</li>
            <li>Настроить отдельный user_id для долговременной памяти</li>
          </ul>
          <p class="mt-2">
            Долговременная память хранит только важные воспоминания (важность 7+) и имеет больший срок хранения (365 дней).
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
