<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  isListening?: boolean
  isRecording?: boolean
  isVoiceActive?: boolean
  audioLevel?: number
  microphoneSensitivity?: number
  speechThreshold?: number
  noiseReduction?: boolean
  showControls?: boolean
}

interface Emits {
  (e: 'update:microphoneSensitivity', value: number): void
  (e: 'update:speechThreshold', value: number): void
  (e: 'update:noiseReduction', value: boolean): void
  (e: 'toggleListening'): void
  (e: 'toggleControls'): void
}

const props = withDefaults(defineProps<Props>(), {
  isListening: false,
  isRecording: false,
  isVoiceActive: false,
  audioLevel: 0,
  microphoneSensitivity: 0.5,
  speechThreshold: 0.5,
  noiseReduction: true,
  showControls: false,
})

const emit = defineEmits<Emits>()

// Локальные состояния для плавных анимаций
const localSensitivity = ref(props.microphoneSensitivity)
const localThreshold = ref(props.speechThreshold)
const localNoiseReduction = ref(props.noiseReduction)

// Синхронизация с пропсами
watch(() => props.microphoneSensitivity, (value) => {
  localSensitivity.value = value
})

watch(() => props.speechThreshold, (value) => {
  localThreshold.value = value
})

watch(() => props.noiseReduction, (value) => {
  localNoiseReduction.value = value
})

// Эмиты изменений с дебаунсом
let sensitivityTimeout: ReturnType<typeof setTimeout>
let thresholdTimeout: ReturnType<typeof setTimeout>

function updateSensitivity(value: number) {
  localSensitivity.value = value
  clearTimeout(sensitivityTimeout)
  sensitivityTimeout = setTimeout(() => {
    emit('update:microphoneSensitivity', value)
  }, 150)
}

function updateThreshold(value: number) {
  localThreshold.value = value
  clearTimeout(thresholdTimeout)
  thresholdTimeout = setTimeout(() => {
    emit('update:speechThreshold', value)
  }, 150)
}

function updateNoiseReduction(value: boolean) {
  localNoiseReduction.value = value
  emit('update:noiseReduction', value)
}

// Вычисляемые стили для индикации
const microphoneIconClass = computed(() => {
  if (props.isRecording) {
    return 'text-red-500 animate-pulse'
  }
  if (props.isListening) {
    return 'text-primary-500'
  }
  return 'text-gray-400'
})

const audioLevelIndicator = computed(() => {
  const level = props.audioLevel * 100
  return Math.min(level, 100)
})

// Пульсация для активного голоса
const voiceActiveClass = computed(() => {
  return props.isVoiceActive
    ? 'animate-pulse scale-110 shadow-lg shadow-primary-500/50'
    : ''
})
</script>

<template>
  <div class="voice-controls relative">
    <!-- Основная кнопка микрофона с индикацией -->
    <div class="flex items-center space-x-3">
      <!-- Кнопка микрофона -->
      <button
        type="button"
        class="relative border-2 rounded-full p-3 transition-all duration-300 ease-in-out"
        :class="[
          microphoneIconClass,
          voiceActiveClass,
          props.isListening
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-primary-400',
        ]"
        @click="emit('toggleListening')"
      >
        <!-- Иконка микрофона -->
        <div
          class="h-5 w-5 transition-colors duration-200"
          :class="props.isListening ? 'i-solar:microphone-3-bold' : 'i-solar:microphone-3-line-duotone'"
        />

        <!-- Индикатор уровня звука -->
        <div
          v-if="props.isListening"
          class="absolute left-1/2 h-1 transform rounded-full bg-primary-500 transition-all duration-100 ease-out -bottom-1 -translate-x-1/2"
          :style="{ width: `${Math.max(8, audioLevelIndicator * 0.32)}px` }"
        />

        <!-- Точка записи -->
        <div
          v-if="props.isRecording"
          class="absolute h-3 w-3 animate-pulse rounded-full bg-red-500 -right-1 -top-1"
        />
      </button>

      <!-- Кнопка настроек -->
      <button
        type="button"
        class="rounded-lg p-2 text-gray-500 transition-colors duration-200 hover:bg-gray-100 dark:text-gray-400 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        @click="emit('toggleControls')"
      >
        <div class="i-solar:settings-bold-duotone h-4 w-4" />
      </button>
    </div>

    <!-- Расширенные настройки -->
    <div
      v-if="props.showControls"
      class="absolute bottom-full left-0 z-50 mb-2 min-w-80 border border-gray-200 rounded-lg bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <h4 class="mb-3 text-sm text-gray-900 font-medium dark:text-white">
        Настройки голосового взаимодействия
      </h4>

      <!-- Чувствительность микрофона -->
      <div class="mb-4">
        <label class="mb-2 block text-xs text-gray-700 font-medium dark:text-gray-300">
          Чувствительность микрофона
        </label>
        <div class="flex items-center space-x-3">
          <span class="text-xs text-gray-500">Низкая</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="localSensitivity"
            class="slider h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-600"
            @input="updateSensitivity(Number(($event.target as HTMLInputElement).value))"
          >
          <span class="text-xs text-gray-500">Высокая</span>
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Текущее значение: {{ Math.round(localSensitivity * 100) }}%
        </p>
      </div>

      <!-- Порог речи -->
      <div class="mb-4">
        <label class="mb-2 block text-xs text-gray-700 font-medium dark:text-gray-300">
          Порог обнаружения речи
        </label>
        <div class="flex items-center space-x-3">
          <span class="text-xs text-gray-500">0</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="localThreshold"
            class="slider h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-600"
            @input="updateThreshold(Number(($event.target as HTMLInputElement).value))"
          >
          <span class="text-xs text-gray-500">1</span>
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Текущее значение: {{ Math.round(localThreshold * 100) }}%
        </p>
      </div>

      <!-- Шумоподавление -->
      <div class="mb-4">
        <label class="flex items-center space-x-2">
          <input
            type="checkbox"
            :checked="localNoiseReduction"
            class="border-gray-300 rounded text-primary-600 focus:ring-primary-500"
            @change="updateNoiseReduction(($event.target as HTMLInputElement).checked)"
          >
          <span class="text-xs text-gray-700 font-medium dark:text-gray-300">
            Включить шумоподавление
          </span>
        </label>
      </div>

      <!-- Статус -->
      <div class="border-t border-gray-200 pt-2 dark:border-gray-600">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 dark:text-gray-400">Статус:</span>
          <span
            :class="props.isListening
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-500 dark:text-gray-400'"
          >
            {{ props.isListening ? 'Слушаю' : 'Отключено' }}
          </span>
        </div>
        <div v-if="props.isListening" class="mt-1 flex items-center justify-between text-xs">
          <span class="text-gray-500 dark:text-gray-400">Уровень звука:</span>
          <span class="text-blue-600 dark:text-blue-400">
            {{ Math.round(audioLevelIndicator) }}%
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Стили для слайдеров */
.slider::-webkit-slider-thumb {
  appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.slider::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.voice-controls {
  position: relative;
  z-index: 10;
}
</style>
