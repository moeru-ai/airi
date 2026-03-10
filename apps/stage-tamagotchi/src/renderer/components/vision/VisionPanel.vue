<script setup lang="ts">
import { useVisionStore } from '@proj-airi/stage-ui/stores/vision'
/**
 * 视觉面板组件
 * 显示屏幕截图和 AI 分析结果
 */
import { computed, ref } from 'vue'

import VisionTrigger from './VisionTrigger.vue'

const props = defineProps<{
  collapsible?: boolean
  defaultCollapsed?: boolean
}>()

const store = useVisionStore()

const isCollapsed = ref(props.defaultCollapsed ?? false)
const isCopied = ref(false)

const hasResult = computed(() => store.lastScreenshot || store.lastAnalysis)
const screenshotUrl = computed(() => {
  if (!store.lastScreenshot)
    return null
  return `data:image/png;base64,${store.lastScreenshot}`
})

const formattedTimestamp = computed(() => {
  if (!store.lastAnalysis?.timestamp)
    return ''
  return new Date(store.lastAnalysis.timestamp).toLocaleString('zh-CN')
})

function toggleCollapse() {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value
  }
}

async function copyAnalysis() {
  if (!store.lastAnalysis?.description)
    return

  try {
    await navigator.clipboard.writeText(store.lastAnalysis.description)
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  }
  catch (err) {
    console.error('Failed to copy:', err)
  }
}

function downloadScreenshot() {
  if (!store.lastScreenshot)
    return

  const link = document.createElement('a')
  link.href = `data:image/png;base64,${store.lastScreenshot}`
  link.download = `screenshot-${Date.now()}.png`
  link.click()
}

function clearResult() {
  store.clearLastResult()
}

async function reanalyze() {
  if (!store.lastScreenshot)
    return
  await store.analyzeScreen()
}
</script>

<template>
  <div class="vision-panel overflow-hidden rounded-xl bg-white shadow-lg dark:bg-gray-900">
    <!-- Header -->
    <div
      class="panel-header flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
      :class="{ 'cursor-pointer': collapsible }"
      @click="toggleCollapse"
    >
      <div class="flex items-center gap-2">
        <svg class="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span class="text-gray-900 font-medium dark:text-white">视觉分析</span>
        <span v-if="formattedTimestamp" class="text-xs text-gray-500 dark:text-gray-400">
          {{ formattedTimestamp }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <VisionTrigger size="small" variant="ghost" />

        <button
          v-if="collapsible"
          class="rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          @click.stop="toggleCollapse"
        >
          <svg
            class="h-5 w-5 text-gray-500 transition-transform"
            :class="{ 'rotate-180': isCollapsed }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div v-show="!isCollapsed" class="panel-content">
      <!-- Empty State -->
      <div v-if="!hasResult" class="empty-state flex flex-col items-center justify-center px-4 py-12">
        <div class="mb-4 h-16 w-16 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <svg class="h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <p class="mb-4 text-center text-gray-500 dark:text-gray-400">
          点击眼睛按钮捕获并分析屏幕
        </p>
        <VisionTrigger />
      </div>

      <!-- Result Content -->
      <div v-else class="result-content">
        <!-- Screenshot -->
        <div v-if="screenshotUrl" class="screenshot-container relative">
          <img
            :src="screenshotUrl"
            alt="屏幕截图"
            class="h-auto max-h-64 w-full bg-gray-100 object-contain dark:bg-gray-800"
          >

          <!-- Screenshot Actions -->
          <div class="absolute right-2 top-2 flex gap-1">
            <button
              class="rounded-lg bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
              title="下载截图"
              @click="downloadScreenshot"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Analysis Result -->
        <div v-if="store.lastAnalysis" class="analysis-result p-4">
          <div class="mb-2 flex items-center justify-between">
            <h4 class="text-sm text-gray-700 font-medium dark:text-gray-300">
              分析结果
            </h4>
            <div class="flex gap-1">
              <button
                class="rounded p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                :class="{ 'text-green-500': isCopied }"
                :title="isCopied ? '已复制' : '复制'"
                @click="copyAnalysis"
              >
                <svg v-if="!isCopied" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
                <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>

              <button
                class="rounded p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                title="重新分析"
                @click="reanalyze"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
              </button>

              <button
                class="rounded p-1.5 text-red-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                title="清除"
                @click="clearResult"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          <div class="analysis-text whitespace-pre-wrap text-sm text-gray-600 leading-relaxed dark:text-gray-400">
            {{ store.lastAnalysis.description }}
          </div>

          <!-- Elements List -->
          <div v-if="store.lastAnalysis.elements && store.lastAnalysis.elements.length > 0" class="elements-list mt-4">
            <h5 class="mb-2 text-xs text-gray-500 font-medium dark:text-gray-500">
              检测到的元素
            </h5>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(element, index) in store.lastAnalysis.elements.slice(0, 10)"
                :key="index"
                class="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              >
                {{ element.type }}{{ element.text ? `: ${element.text}` : '' }}
              </span>
              <span
                v-if="store.lastAnalysis.elements.length > 10"
                class="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-gray-800"
              >
                +{{ store.lastAnalysis.elements.length - 10 }} 更多
              </span>
            </div>
          </div>

          <!-- Confidence -->
          <div v-if="store.lastAnalysis.confidence" class="confidence mt-4 flex items-center gap-2">
            <span class="text-xs text-gray-500">置信度:</span>
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="h-full rounded-full bg-primary transition-all"
                :style="{ width: `${store.lastAnalysis.confidence * 100}%` }"
              />
            </div>
            <span class="text-xs text-gray-500">{{ Math.round(store.lastAnalysis.confidence * 100) }}%</span>
          </div>
        </div>

        <!-- Error -->
        <div v-if="store.error" class="error-message border-t border-red-100 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/20">
          <div class="flex items-start gap-2">
            <svg class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <div class="flex-1">
              <p class="text-sm text-red-600 dark:text-red-400">
                {{ store.error }}
              </p>
              <button
                class="mt-2 text-xs text-red-500 underline hover:text-red-600 dark:hover:text-red-300"
                @click="store.clearError()"
              >
                清除错误
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vision-panel {
  max-width: 100%;
}

.screenshot-container img {
  transition: transform 0.3s ease;
}

.screenshot-container:hover img {
  transform: scale(1.02);
}

.analysis-text {
  max-height: 200px;
  overflow-y: auto;
}

/* Scrollbar styling */
.analysis-text::-webkit-scrollbar {
  width: 4px;
}

.analysis-text::-webkit-scrollbar-track {
  background: transparent;
}

.analysis-text::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}

.analysis-text::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
