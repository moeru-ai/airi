<script setup lang="ts">
import { useVisionStore } from '@proj-airi/stage-ui/stores/vision'
/**
 * 视觉触发按钮组件
 * 用于触发屏幕捕获和分析
 */
import { computed } from 'vue'

const props = defineProps<{
  size?: 'small' | 'medium' | 'large'
  variant?: 'default' | 'ghost' | 'outline'
}>()

const emit = defineEmits<{
  (e: 'capture', screenshot: string): void
  (e: 'analyze', analysis: AnalysisResult): void
  (e: 'error', error: string): void
}>()

const store = useVisionStore()

const size = computed(() => props.size || 'medium')
const variant = computed(() => props.variant || 'default')

const isProcessing = computed(() => store.isCapturing || store.isAnalyzing)
const canAnalyze = computed(() => store.canAnalyze)

const buttonClass = computed(() => {
  const base = ['vision-trigger', 'rounded-full', 'flex', 'items-center', 'justify-center', 'transition-all']

  // Size
  switch (size.value) {
    case 'small':
      base.push('w-8', 'h-8')
      break
    case 'large':
      base.push('w-14', 'h-14')
      break
    default:
      base.push('w-11', 'h-11')
  }

  // Variant
  switch (variant.value) {
    case 'ghost':
      base.push('bg-transparent', 'hover:bg-gray-100', 'dark:hover:bg-gray-800')
      break
    case 'outline':
      base.push('border-2', 'border-current', 'bg-transparent')
      break
    default:
      base.push('bg-primary', 'text-white', 'hover:bg-primary-dark')
  }

  // State
  if (isProcessing.value) {
    base.push('opacity-70', 'cursor-wait')
  }
  else if (!canAnalyze.value) {
    base.push('opacity-50', 'cursor-not-allowed')
  }
  else {
    base.push('cursor-pointer', 'hover:scale-105', 'active:scale-95')
  }

  return base
})

const iconSize = computed(() => {
  switch (size.value) {
    case 'small':
      return 16
    case 'large':
      return 28
    default:
      return 22
  }
})

async function handleClick() {
  if (isProcessing.value || !canAnalyze.value) {
    return
  }

  const result = await store.captureAndAnalyze()

  if (result) {
    emit('capture', result.screenshot)
    emit('analyze', result.analysis)
  }
  else if (store.error) {
    emit('error', store.error)
  }
}
</script>

<template>
  <button
    :class="buttonClass"
    :disabled="isProcessing || !canAnalyze"
    :title="isProcessing ? '正在分析...' : canAnalyze ? '点击分析屏幕' : '视觉功能未就绪'"
    @click="handleClick"
  >
    <!-- Loading Spinner -->
    <div v-if="isProcessing" class="animate-spin">
      <svg
        :width="iconSize"
        :height="iconSize"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    </div>

    <!-- Eye Icon -->
    <svg
      v-else
      :width="iconSize"
      :height="iconSize"
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
  </button>
</template>

<style scoped>
.vision-trigger {
  position: relative;
  overflow: hidden;
}

.vision-trigger::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s;
}

.vision-trigger:hover::after {
  opacity: 1;
}

@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.vision-trigger:not(:disabled)::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 2px solid currentColor;
  opacity: 0;
}

.vision-trigger:not(:disabled):active::before {
  animation: pulse-ring 0.4s ease-out;
}
</style>
