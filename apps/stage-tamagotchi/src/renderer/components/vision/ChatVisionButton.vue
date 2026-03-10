<script setup lang="ts">
import { useChatVisionStore } from '@proj-airi/stage-ui/stores/chat-vision'
import { useVisionStore } from '@proj-airi/stage-ui/stores/vision'
/**
 * 聊天视觉按钮组件
 * 集成到聊天输入区域，用于触发视觉分析
 */
import { computed } from 'vue'

const emit = defineEmits<{
  (e: 'visionTriggered', result: { screenshot: string, analysis: any }): void
  (e: 'visionError', error: string): void
}>()

const visionStore = useVisionStore()
const chatVisionStore = useChatVisionStore()

const isProcessing = computed(() => visionStore.isCapturing || visionStore.isAnalyzing)
const canTrigger = computed(() => visionStore.canAnalyze)
const hasVisionContext = computed(() => chatVisionStore.hasVisionContext)

async function handleClick() {
  if (isProcessing.value || !canTrigger.value) {
    return
  }

  const result = await chatVisionStore.triggerVision()

  if (result) {
    emit('visionTriggered', {
      screenshot: result.screenshot,
      analysis: result.analysis,
    })
  }
  else if (visionStore.error) {
    emit('visionError', visionStore.error)
  }
}

async function handleQuickAnalyze() {
  // 快速分析，不等待结果，直接触发
  await handleClick()
}
</script>

<template>
  <div class="chat-vision-button flex items-center gap-1">
    <!-- 视觉触发按钮 -->
    <button
      class="vision-btn flex items-center gap-1.5 rounded-lg p-2 transition-colors"
      :class="{
        'bg-primary/10 text-primary hover:bg-primary/20': hasVisionContext,
        'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800': !hasVisionContext,
        'opacity-50 cursor-not-allowed': !canTrigger,
        'animate-pulse': isProcessing,
      }"
      :disabled="!canTrigger"
      :title="hasVisionContext ? '已捕获屏幕，点击重新分析' : '捕获并分析屏幕'"
      @click="handleClick"
    >
      <!-- 眼睛图标 -->
      <svg
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>

      <!-- 状态指示器 -->
      <span
        v-if="hasVisionContext"
        class="h-2 w-2 rounded-full bg-green-500"
      />

      <!-- 加载动画 -->
      <svg
        v-if="isProcessing"
        class="h-4 w-4 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    </button>

    <!-- 快捷提示 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="hasVisionContext && !isProcessing"
        class="quick-tip whitespace-nowrap rounded-md bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400"
      >
        屏幕已捕获
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chat-vision-button {
  position: relative;
}

.vision-btn {
  position: relative;
  overflow: hidden;
}

.vision-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, currentColor 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.2s;
}

.vision-btn:hover::before {
  opacity: 0.1;
}

.vision-btn:active {
  transform: scale(0.95);
}

.quick-tip {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
