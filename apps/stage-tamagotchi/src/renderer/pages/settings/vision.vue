<script setup lang="ts">
import type { VisionConfig } from '../../../shared/vision'

import { useVisionStore } from '@proj-airi/stage-ui/stores/vision'
/**
 * 视觉设置页面
 * 配置视觉系统的各项参数
 */
import { computed, onMounted, ref } from 'vue'

const store = useVisionStore()

// 本地表单状态
const form = ref<Partial<VisionConfig>>({})
const isLoading = ref(false)
const isTesting = ref(false)
const testResult = ref<{ success: boolean, message: string } | null>(null)
const isSaving = ref(false)

// 模型选项
const modelOptions = [
  { value: 'doubao-1.6-vision', label: '豆包 1.6 Vision (云端)', type: 'cloud' },
  { value: 'gemini-3-pro', label: 'Gemini 3 Pro (云端)', type: 'cloud' },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash (云端)', type: 'cloud' },
  { value: 'qwen2.5-vl', label: 'Qwen 2.5 VL (本地)', type: 'local' },
  { value: 'ui-tars', label: 'UI-TARS (本地)', type: 'local' },
]

// 触发模式选项
const triggerModeOptions = [
  { value: 'manual', label: '手动触发', description: '点击按钮触发分析' },
  { value: 'voice', label: '语音触发', description: '说出"帮我看看屏幕"等指令' },
  { value: 'auto', label: '自动轮询', description: '按设定间隔自动捕获屏幕' },
  { value: 'event', label: '事件触发', description: '切换应用时触发' },
]

// 轮询间隔选项
const intervalOptions = [
  { value: 1000, label: '1 秒' },
  { value: 3000, label: '3 秒' },
  { value: 5000, label: '5 秒' },
  { value: 10000, label: '10 秒' },
  { value: 30000, label: '30 秒' },
  { value: 60000, label: '1 分钟' },
]

// 当前选中的模型类型
const selectedModelType = computed(() => {
  const model = modelOptions.find(m => m.value === form.value.model)
  return model?.type || 'cloud'
})

// 是否需要 API 密钥
const needsApiKey = computed(() => selectedModelType.value === 'cloud')

// 是否需要本地端点
const needsLocalEndpoint = computed(() => selectedModelType.value === 'local')

// 初始化表单
onMounted(async () => {
  isLoading.value = true
  await store.init()
  form.value = { ...store.config }
  isLoading.value = false
})

// 保存配置
async function saveConfig() {
  isSaving.value = true
  const success = await store.updateConfig(form.value)
  isSaving.value = false

  if (success) {
    showNotification('配置已保存', 'success')
  }
  else {
    showNotification(store.error || '保存失败', 'error')
  }
}

// 测试连接
async function testConnection() {
  isTesting.value = true
  testResult.value = null

  try {
    // 先保存当前配置
    await store.updateConfig(form.value)

    // 尝试捕获屏幕（这会测试模型连接）
    const screenshot = await store.captureScreen()

    if (screenshot) {
      // 尝试分析
      const analysis = await store.analyzeScreen('测试连接')

      if (analysis) {
        testResult.value = {
          success: true,
          message: '连接成功！视觉功能工作正常。',
        }
      }
      else {
        testResult.value = {
          success: false,
          message: store.error || '分析失败，请检查配置',
        }
      }
    }
    else {
      testResult.value = {
        success: false,
        message: store.error || '屏幕捕获失败',
      }
    }
  }
  catch (error) {
    testResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '测试失败',
    }
  }
  finally {
    isTesting.value = false
  }
}

// 通知
const notification = ref<{ message: string, type: 'success' | 'error' } | null>(null)

function showNotification(message: string, type: 'success' | 'error') {
  notification.value = { message, type }
  setTimeout(() => {
    notification.value = null
  }, 3000)
}

// 重置配置
function resetConfig() {
  form.value = { ...store.config }
  showNotification('配置已重置', 'success')
}

// 清除历史记录
function clearHistory() {
  store.clearHistory()
  showNotification('历史记录已清除', 'success')
}
</script>

<template>
  <div class="vision-settings mx-auto max-w-4xl p-6">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="mb-2 text-2xl text-gray-900 font-bold dark:text-white">
        视觉设置
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        配置 AI 视觉功能，让 AI 能够"看到"屏幕内容并与你互动
      </p>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin border-b-2 border-primary rounded-full" />
    </div>

    <!-- Form -->
    <div v-else class="space-y-8">
      <!-- Enable/Disable -->
      <section class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg text-gray-900 font-semibold dark:text-white">
              启用视觉功能
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              开启后，AI 将能够捕获和分析屏幕内容
            </p>
          </div>
          <label class="relative inline-flex cursor-pointer items-center">
            <input
              v-model="form.enabled"
              type="checkbox"
              class="peer sr-only"
            >
            <div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-primary peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>
      </section>

      <!-- Model Configuration -->
      <section class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 class="mb-4 text-lg text-gray-900 font-semibold dark:text-white">
          模型配置
        </h2>

        <div class="space-y-4">
          <!-- Model Selection -->
          <div>
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              视觉模型
            </label>
            <select
              v-model="form.model"
              class="w-full border border-gray-300 rounded-lg bg-white px-4 py-2 text-gray-900 dark:border-gray-600 focus:border-transparent dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary"
            >
              <optgroup label="云端模型">
                <option v-for="model in modelOptions.filter(m => m.type === 'cloud')" :key="model.value" :value="model.value">
                  {{ model.label }}
                </option>
              </optgroup>
              <optgroup label="本地模型">
                <option v-for="model in modelOptions.filter(m => m.type === 'local')" :key="model.value" :value="model.value">
                  {{ model.label }}
                </option>
              </optgroup>
            </select>
            <p class="mt-1 text-xs text-gray-500">
              {{ selectedModelType === 'cloud' ? '使用云端 API，需要网络连接和 API 密钥' : '使用本地部署的模型，需要自行部署模型服务' }}
            </p>
          </div>

          <!-- API Key (for cloud models) -->
          <div v-if="needsApiKey">
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              API 密钥
            </label>
            <input
              v-model="form.apiKey"
              type="password"
              placeholder="输入你的 API 密钥"
              class="w-full border border-gray-300 rounded-lg bg-white px-4 py-2 text-gray-900 dark:border-gray-600 focus:border-transparent dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary"
            >
            <p class="mt-1 text-xs text-gray-500">
              你的 API 密钥将被安全存储
            </p>
          </div>

          <!-- API Endpoint (optional) -->
          <div v-if="needsApiKey">
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              API 端点 (可选)
            </label>
            <input
              v-model="form.apiEndpoint"
              type="text"
              placeholder="使用默认端点"
              class="w-full border border-gray-300 rounded-lg bg-white px-4 py-2 text-gray-900 dark:border-gray-600 focus:border-transparent dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary"
            >
          </div>

          <!-- Local Model Endpoint (for local models) -->
          <div v-if="needsLocalEndpoint">
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              本地模型端点
            </label>
            <input
              v-model="form.localModelEndpoint"
              type="text"
              placeholder="http://localhost:8000/v1"
              class="w-full border border-gray-300 rounded-lg bg-white px-4 py-2 text-gray-900 dark:border-gray-600 focus:border-transparent dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary"
            >
            <p class="mt-1 text-xs text-gray-500">
              本地模型服务的地址，默认使用 Ollama 或 vLLM 的标准端口
            </p>
          </div>
        </div>
      </section>

      <!-- Trigger Mode -->
      <section class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 class="mb-4 text-lg text-gray-900 font-semibold dark:text-white">
          触发方式
        </h2>

        <div class="space-y-3">
          <label
            v-for="mode in triggerModeOptions"
            :key="mode.value"
            class="flex cursor-pointer items-start border-2 rounded-lg p-4 transition-colors"
            :class="form.triggerMode === mode.value
              ? 'border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
          >
            <input
              v-model="form.triggerMode"
              type="radio"
              :value="mode.value"
              class="mr-3 mt-1"
            >
            <div>
              <div class="text-gray-900 font-medium dark:text-white">{{ mode.label }}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">{{ mode.description }}</div>
            </div>
          </label>
        </div>

        <!-- Auto Interval (for auto mode) -->
        <div v-if="form.triggerMode === 'auto'" class="mt-4 border-l-2 border-primary pl-4">
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            轮询间隔
          </label>
          <select
            v-model="form.autoInterval"
            class="border border-gray-300 rounded-lg bg-white px-4 py-2 text-gray-900 dark:border-gray-600 focus:border-transparent dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary"
          >
            <option v-for="interval in intervalOptions" :key="interval.value" :value="interval.value">
              {{ interval.label }}
            </option>
          </select>
        </div>
      </section>

      <!-- Privacy Settings -->
      <section class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 class="mb-4 text-lg text-gray-900 font-semibold dark:text-white">
          隐私设置
        </h2>

        <div class="space-y-4">
          <!-- Privacy Mode -->
          <div class="flex items-center justify-between">
            <div>
              <div class="text-gray-900 font-medium dark:text-white">
                隐私模式
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                启用后，截图不会保存到历史记录
              </div>
            </div>
            <label class="relative inline-flex cursor-pointer items-center">
              <input
                v-model="form.privacyMode"
                type="checkbox"
                class="peer sr-only"
              >
              <div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-primary peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
            </label>
          </div>

          <!-- Save History -->
          <div class="flex items-center justify-between">
            <div>
              <div class="text-gray-900 font-medium dark:text-white">
                保存历史记录
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                保存截图和分析结果供以后查看
              </div>
            </div>
            <label class="relative inline-flex cursor-pointer items-center">
              <input
                v-model="form.saveHistory"
                type="checkbox"
                class="peer sr-only"
              >
              <div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-primary peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
            </label>
          </div>

          <!-- Max History Items -->
          <div v-if="form.saveHistory">
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              最大历史记录数
            </label>
            <input
              v-model.number="form.maxHistoryItems"
              type="number"
              min="1"
              max="100"
              class="w-32 border border-gray-300 rounded-lg bg-white px-4 py-2 text-gray-900 dark:border-gray-600 focus:border-transparent dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary"
            >
          </div>

          <!-- Clear History Button -->
          <button
            class="border border-red-300 rounded-lg px-4 py-2 text-sm text-red-600 transition-colors dark:border-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            @click="clearHistory"
          >
            清除历史记录
          </button>
        </div>
      </section>

      <!-- Test Connection -->
      <section class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 class="mb-4 text-lg text-gray-900 font-semibold dark:text-white">
          测试连接
        </h2>

        <div class="flex items-center gap-4">
          <button
            class="hover:bg-primary-dark rounded-lg bg-primary px-6 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isTesting || !form.enabled"
            @click="testConnection"
          >
            <span v-if="isTesting">测试中...</span>
            <span v-else>测试连接</span>
          </button>

          <div
            v-if="testResult"
            class="flex items-center gap-2"
            :class="testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
          >
            <svg v-if="testResult.success" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            {{ testResult.message }}
          </div>
        </div>
      </section>

      <!-- Actions -->
      <section class="flex items-center justify-end gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          class="border border-gray-300 rounded-lg px-6 py-2 text-gray-700 transition-colors dark:border-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
          @click="resetConfig"
        >
          重置
        </button>
        <button
          class="hover:bg-primary-dark rounded-lg bg-primary px-6 py-2 text-white transition-colors disabled:opacity-50"
          :disabled="isSaving"
          @click="saveConfig"
        >
          <span v-if="isSaving">保存中...</span>
          <span v-else>保存配置</span>
        </button>
      </section>
    </div>

    <!-- Notification -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform translate-y-2 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform translate-y-2 opacity-0"
    >
      <div
        v-if="notification"
        class="fixed bottom-4 right-4 rounded-lg px-6 py-3 shadow-lg"
        :class="notification.type === 'success'
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'"
      >
        {{ notification.message }}
      </div>
    </Transition>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: 视觉设置
  icon: i-lucide-eye
</route>
