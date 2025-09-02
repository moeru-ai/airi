<script setup lang="ts">
import { Alert, Button, ErrorContainer } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const providersStore = useProvidersStore()
const { allChatProvidersMetadata } = storeToRefs(providersStore)

// Состояние для тестирования
const isProcessingImage = ref(false)
const visionResult = ref('')
const visionError = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)

// Провайдеры с поддержкой vision
const visionProviders = computed(() => {
  return allChatProvidersMetadata.value.filter(provider =>
    ['lm-studio', 'openai', 'google-generative-ai', 'anthropic'].includes(provider.id),
  )
})

const selectedProvider = ref('lm-studio')
const testPrompt = ref('Опиши что ты видишь на этом изображении')

// Выбор изображения
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    selectedFile.value = file

    // Создаем preview
    const reader = new FileReader()
    reader.onload = (e) => {
      previewUrl.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

// Обработка изображения
async function processImage() {
  if (!selectedFile.value) {
    visionError.value = 'Пожалуйста, выберите изображение'
    return
  }

  isProcessingImage.value = true
  visionError.value = null
  visionResult.value = ''

  try {
    // Получаем конфигурацию провайдера
    const config = providersStore.getProviderConfig(selectedProvider.value)
    if (!config?.baseUrl) {
      throw new Error(`Провайдер ${selectedProvider.value} не настроен`)
    }

    // Конвертируем изображение в base64
    const base64 = await fileToBase64(selectedFile.value)

    // Формируем запрос для различных провайдеров
    let requestBody: any

    if (selectedProvider.value === 'lm-studio') {
      // LM Studio с Gemma 3 4B поддерживает vision
      requestBody = {
        model: config.model || 'gemma-2-2b-it', // используем выбранную модель
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: testPrompt.value,
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }
    }
    else {
      // Для других провайдеров используем стандартный формат OpenAI
      requestBody = {
        model: config.model || 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: testPrompt.value,
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }
    }

    const response = await fetch(`${config.baseUrl.trim().replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    visionResult.value = data.choices?.[0]?.message?.content || 'Нет ответа от модели'
  }
  catch (error) {
    console.error('Vision processing error:', error)
    visionError.value = error instanceof Error ? error.message : 'Неизвестная ошибка'
  }
  finally {
    isProcessingImage.value = false
  }
}

// Конвертация файла в base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Очистка
function clearImage() {
  selectedFile.value = null
  previewUrl.value = null
  visionResult.value = ''
  visionError.value = null
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl text-gray-900 font-bold dark:text-white">
        {{ t('settings.pages.modules.vision.title') }}
      </h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        {{ t('settings.pages.modules.vision.description') }}
      </p>
    </div>

    <!-- Provider Selection -->
    <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <h2 class="mb-4 text-lg text-gray-900 font-medium dark:text-white">
        Выбор провайдера
      </h2>

      <div class="space-y-4">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            AI провайдер
          </label>
          <select
            v-model="selectedProvider"
            class="block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
          >
            <option v-for="provider in visionProviders" :key="provider.id" :value="provider.id">
              {{ provider.localizedName }}
            </option>
          </select>
          <p class="mt-1 text-sm text-gray-500">
            Для работы модуля зрения провайдер должен поддерживать обработку изображений
          </p>
        </div>

        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            Промпт для анализа
          </label>
          <textarea
            v-model="testPrompt"
            rows="3"
            class="block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
            placeholder="Введите инструкцию для анализа изображения..."
          />
        </div>
      </div>
    </div>

    <!-- Image Upload & Processing -->
    <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <h2 class="mb-4 text-lg text-gray-900 font-medium dark:text-white">
        Тестирование зрения
      </h2>

      <div class="space-y-4">
        <!-- File Upload -->
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            Загрузить изображение
          </label>
          <input
            type="file"
            accept="image/*"
            class="block w-full text-sm text-gray-500 file:mr-4 file:border-0 file:rounded-md file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:text-primary-700 file:font-medium dark:file:bg-primary-900 hover:file:bg-primary-100 dark:file:text-primary-200"
            @change="handleFileSelect"
          >
        </div>

        <!-- Image Preview -->
        <div v-if="previewUrl" class="space-y-4">
          <div>
            <img :src="previewUrl" alt="Preview" class="max-h-64 max-w-md border border-gray-200 rounded-lg dark:border-gray-700">
          </div>

          <div class="flex space-x-3">
            <Button
              :disabled="isProcessingImage"
              @click="processImage"
            >
              <div v-if="isProcessingImage" class="mr-2 h-4 w-4 animate-spin">
                <div class="i-solar:loading-bold-duotone" />
              </div>
              {{ isProcessingImage ? 'Анализирую...' : 'Анализировать изображение' }}
            </Button>

            <Button variant="outline" @click="clearImage">
              Очистить
            </Button>
          </div>
        </div>

        <!-- Error Display -->
        <ErrorContainer v-if="visionError" title="Ошибка анализа" :error="visionError" />

        <!-- Result Display -->
        <div v-if="visionResult" class="space-y-2">
          <label class="block text-sm text-gray-700 font-medium dark:text-gray-300">
            Результат анализа
          </label>
          <div class="border rounded-md bg-gray-50 p-4 dark:bg-gray-900">
            <p class="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
              {{ visionResult }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Configuration Instructions -->
    <Alert type="info">
      <template #title>
        Настройка модуля зрения
      </template>
      <template #content>
        <div class="space-y-2">
          <p>Для работы модуля зрения необходимо:</p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Настроить один из поддерживаемых AI-провайдеров (LM Studio с Gemma 3 4B, OpenAI GPT-4V, и др.)</li>
            <li>Убедиться, что выбранная модель поддерживает обработку изображений</li>
            <li>Проверить настройки провайдера в разделе "Провайдеры"</li>
          </ul>
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
    pageSpecificAvailable: true
</route>
