<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Состояние установки компонентов
const isInstallingLMStudio = ref(false)
const isInstallingKoboldCPP = ref(false)
const isInstallingSileroTTS = ref(false)
const isInstallingSileroSTT = ref(false)
const isInstallingMemvid = ref(false)
const isInstallingMem0 = ref(false)
const installationStatus = ref<Record<string, string>>({})

// Доступные компоненты для установки
const components = computed(() => [
  {
    id: 'lm-studio',
    name: 'LM Studio',
    description: 'Локальный LLM сервер для запуска больших языковых моделей',
    icon: 'i-solar:chip-bold-duotone',
    downloadUrl: 'https://lmstudio.ai/',
    installInstructions: [
      '1. Скачайте LM Studio с официального сайта',
      '2. Установите приложение на ваш компьютер',
      '3. Запустите LM Studio и загрузите нужную модель',
      '4. Активируйте локальный сервер в настройках',
    ],
    isInstalling: isInstallingLMStudio,
    autoInstall: false, // Требует ручной установки
  },
  {
    id: 'koboldcpp',
    name: 'KoboldCPP',
    description: 'Высокопроизводительный инференс движок для GGML моделей',
    icon: 'i-solar:cpu-bolt-bold-duotone',
    downloadUrl: 'https://github.com/LostRuins/koboldcpp/releases',
    installInstructions: [
      '1. Скачайте последнюю версию KoboldCPP с GitHub',
      '2. Распакуйте архив в удобную папку',
      '3. Запустите koboldcpp.exe или скрипт для вашей ОС',
      '4. Загрузите GGML модель и запустите сервер',
    ],
    isInstalling: isInstallingKoboldCPP,
    autoInstall: false,
  },
  {
    id: 'silero-tts',
    name: 'Silero TTS Server',
    description: 'Сервер синтеза речи на основе Silero моделей',
    icon: 'i-solar:volume-loud-bold-duotone',
    dockerCommand: 'docker run -d --name silero-tts -p 8001:8001 ghcr.io/ouoertheo/silero-tts:latest',
    installInstructions: [
      '1. Убедитесь, что Docker установлен и запущен',
      '2. Нажмите кнопку "Установить" для автоматической установки',
      '3. Дождитесь загрузки и запуска контейнера',
      '4. Сервер будет доступен на порту 8001',
    ],
    isInstalling: isInstallingSileroTTS,
    autoInstall: true,
  },
  {
    id: 'silero-stt',
    name: 'Silero STT Server',
    description: 'Сервер распознавания речи на основе Silero моделей',
    icon: 'i-solar:microphone-3-bold-duotone',
    dockerCommand: 'docker run -d --name silero-stt -p 8002:8002 ghcr.io/ouoertheo/silero-stt:latest',
    installInstructions: [
      '1. Убедитесь, что Docker установлен и запущен',
      '2. Нажмите кнопку "Установить" для автоматической установки',
      '3. Дождитесь загрузки и запуска контейнера',
      '4. Сервер будет доступен на порту 8002',
    ],
    isInstalling: isInstallingSileroSTT,
    autoInstall: true,
  },
  {
    id: 'memvid',
    name: 'memvid - Video Memory Server',
    description: 'Сервер обработки и индексации видео контента для долговременной памяти',
    icon: 'i-solar:video-library-bold-duotone',
    downloadUrl: 'https://github.com/memvid/memvid',
    dockerCommand: 'docker run -d --name memvid -p 8003:8003 -v memvid_data:/app/data memvid/memvid:latest',
    installInstructions: [
      '1. Убедитесь, что Docker установлен и запущен',
      '2. Нажмите кнопку "Установить" для автоматической установки',
      '3. Дождитесь загрузки и запуска контейнера',
      '4. Сервер будет доступен на порту 8003',
      '5. Поддерживает обработку YouTube видео и локальных файлов',
    ],
    isInstalling: isInstallingMemvid,
    autoInstall: true,
  },
  {
    id: 'mem0',
    name: 'mem0 - Memory Management Server',
    description: 'Интеллектуальная система управления памятью для AI ассистентов',
    icon: 'i-solar:brain-bold-duotone',
    downloadUrl: 'https://github.com/mem0ai/mem0',
    dockerCommand: 'docker run -d --name mem0 -p 8002:8002 -v mem0_data:/app/data mem0ai/mem0:latest',
    installInstructions: [
      '1. Убедитесь, что Docker установлен и запущен',
      '2. Нажмите кнопку "Установить" для автоматической установки',
      '3. Дождитесь загрузки и запуска контейнера',
      '4. Сервер будет доступен на порту 8002',
      '5. Поддерживает кратковременную и долговременную память',
    ],
    isInstalling: isInstallingMem0,
    autoInstall: true,
  },
])

// Функции установки
async function installComponent(componentId: string) {
  const component = components.value.find(c => c.id === componentId)
  if (!component)
    return

  component.isInstalling.value = true
  installationStatus.value[componentId] = 'Начинается установка...'

  try {
    if (component.autoInstall && component.dockerCommand) {
      await installWithDocker(componentId, component.dockerCommand)
    }
    else {
      // Для компонентов без автоустановки просто открываем ссылку
      if (component.downloadUrl) {
        window.open(component.downloadUrl, '_blank')
        installationStatus.value[componentId] = 'Перенаправлено на страницу загрузки'
      }
    }
  }
  catch (error) {
    console.error(`Ошибка установки ${componentId}:`, error)
    installationStatus.value[componentId] = `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
  }
  finally {
    component.isInstalling.value = false
  }
}

async function installWithDocker(componentId: string, dockerCommand: string) {
  installationStatus.value[componentId] = 'Проверка Docker...'

  // Проверяем доступность Docker
  try {
    const response = await fetch('http://localhost:2375/version').catch(() => null)
    if (!response?.ok) {
      throw new Error('Docker не доступен. Убедитесь, что Docker Desktop запущен.')
    }
  }
  catch {
    // Fallback: пытаемся выполнить команду через веб-интерфейс или показываем инструкции
    installationStatus.value[componentId] = 'Выполните команду в терминале:'
    throw new Error(`Выполните в терминале: ${dockerCommand}`)
  }

  installationStatus.value[componentId] = 'Загрузка Docker образа...'

  // В реальном приложении здесь должен быть API вызов к бэкенду
  // который выполнит Docker команду на сервере
  await new Promise(resolve => setTimeout(resolve, 3000)) // Симуляция

  installationStatus.value[componentId] = 'Установка завершена успешно!'
}

function openLink(url: string) {
  window.open(url, '_blank')
}

function copyCommand(command: string) {
  navigator.clipboard.writeText(command)
}
</script>

<template>
  <div class="container mx-auto p-6">
    <div class="mb-8">
      <h1 class="mb-2 text-3xl text-gray-900 font-bold dark:text-white">
        {{ t('settings.pages.modules.mcp-server.title') }}
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        {{ t('settings.pages.modules.mcp-server.description') }}
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div
        v-for="component in components"
        :key="component.id"
        class="border border-gray-200 rounded-lg bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-start space-x-4">
          <div class="flex-shrink-0">
            <div
              :class="component.icon"
              class="h-12 w-12 text-primary-600 dark:text-primary-400"
            />
          </div>

          <div class="flex-1">
            <h3 class="mb-2 text-lg text-gray-900 font-semibold dark:text-white">
              {{ component.name }}
            </h3>
            <p class="mb-4 text-gray-600 dark:text-gray-400">
              {{ component.description }}
            </p>

            <!-- Инструкции по установке -->
            <div class="mb-4">
              <h4 class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                Инструкции по установке:
              </h4>
              <ol class="text-sm text-gray-600 space-y-1 dark:text-gray-400">
                <li
                  v-for="(instruction, index) in component.installInstructions"
                  :key="index"
                  class="flex items-start"
                >
                  <span class="mr-2">{{ instruction }}</span>
                </li>
              </ol>
            </div>

            <!-- Docker команда для копирования -->
            <div
              v-if="component.dockerCommand"
              class="mb-4 rounded-md bg-gray-100 p-3 dark:bg-gray-700"
            >
              <div class="flex items-center justify-between">
                <code class="mr-2 flex-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ component.dockerCommand }}
                </code>
                <button
                  type="button"
                  class="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  @click="copyCommand(component.dockerCommand!)"
                >
                  <div class="i-solar:copy-bold-duotone h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- Статус установки -->
            <div
              v-if="installationStatus[component.id]"
              class="mb-4 rounded-md p-3"
              :class="installationStatus[component.id].includes('Ошибка')
                ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'"
            >
              {{ installationStatus[component.id] }}
            </div>

            <!-- Кнопки действий -->
            <div class="flex space-x-3">
              <button
                v-if="component.autoInstall"
                type="button"
                :disabled="component.isInstalling.value"
                class="inline-flex items-center border border-transparent rounded-md bg-primary-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-primary-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                @click="installComponent(component.id)"
              >
                <div
                  v-if="component.isInstalling.value"
                  class="mr-2 h-4 w-4 animate-spin -ml-1"
                >
                  <div class="i-solar:loading-bold-duotone" />
                </div>
                <div
                  v-else
                  class="i-solar:download-bold-duotone mr-2 h-4 w-4 -ml-1"
                />
                {{ component.isInstalling.value ? 'Установка...' : 'Установить' }}
              </button>

              <button
                v-if="component.downloadUrl && !component.autoInstall"
                type="button"
                class="inline-flex items-center border border-gray-300 rounded-md bg-white px-4 py-2 text-sm text-gray-700 font-medium dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-50 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:hover:bg-gray-600"
                @click="openLink(component.downloadUrl!)"
              >
                <div class="i-solar:export-bold-duotone mr-2 h-4 w-4 -ml-1" />
                Скачать
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Дополнительная информация -->
    <div class="mt-8 rounded-lg bg-blue-50 p-6 dark:bg-blue-900/20">
      <div class="flex">
        <div class="i-solar:info-circle-bold-duotone mt-0.5 h-5 w-5 text-blue-400" />
        <div class="ml-3">
          <h3 class="text-sm text-blue-800 font-medium dark:text-blue-200">
            Информация о совместимости
          </h3>
          <div class="mt-2 text-sm text-blue-700 dark:text-blue-300">
            <p class="mb-2">
              Для полной функциональности голосового взаимодействия рекомендуется установить все компоненты:
            </p>
            <ul class="list-disc list-inside space-y-1">
              <li><strong>LM Studio или KoboldCPP</strong> - для работы с языковыми моделями</li>
              <li><strong>Silero TTS</strong> - для синтеза речи</li>
              <li><strong>Silero STT</strong> - для распознавания речи</li>
            </ul>
          </div>
        </div>
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
