<script setup lang="ts">
import type { VisionAuthState } from '../../../shared/vision'

import { ipcRenderer } from 'electron'
/**
 * 视觉功能授权对话框
 * 首次使用时的授权提示
 */
import { onMounted, ref } from 'vue'

import { getAuthPromptMessage, VISION_CHANNELS } from '../../../shared/vision'

const emit = defineEmits<{
  (e: 'granted'): void
  (e: 'denied'): void
}>()

const isVisible = ref(false)
const authState = ref<VisionAuthState>({
  isAuthorized: false,
  denyCount: 0,
})

const promptMessage = getAuthPromptMessage()

onMounted(async () => {
  // 检查授权状态
  const result = await ipcRenderer.invoke(VISION_CHANNELS.GET_AUTH_STATE)
  if (result.success) {
    authState.value = result.data
    if (!authState.value.isAuthorized) {
      isVisible.value = true
    }
  }

  // 监听授权状态变化
  ipcRenderer.on(VISION_CHANNELS.ON_AUTH_CHANGED, (_, state: VisionAuthState) => {
    authState.value = state
    if (state.isAuthorized) {
      isVisible.value = false
      emit('granted')
    }
  })
})

async function handleGrant() {
  await ipcRenderer.invoke(VISION_CHANNELS.GRANT_AUTH)
  isVisible.value = false
  emit('granted')
}

async function handleDeny() {
  await ipcRenderer.invoke(VISION_CHANNELS.REVOKE_AUTH)
  isVisible.value = false
  emit('denied')
}

function handleLearnMore() {
  // 打开隐私政策页面
  window.open('https://github.com/moeru-ai/airi/blob/main/PRIVACY.md', '_blank')
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="isVisible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      @click.self="handleDeny"
    >
      <div class="max-w-md w-full overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <!-- Header -->
        <div class="p-6 pb-4">
          <div class="mb-4 flex items-center gap-3">
            <div class="h-12 w-12 flex items-center justify-center rounded-full bg-primary/10">
              <svg class="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg text-gray-900 font-semibold dark:text-white">
                {{ promptMessage.title }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ promptMessage.message }}
              </p>
            </div>
          </div>

          <!-- Content -->
          <div class="whitespace-pre-line text-sm text-gray-600 leading-relaxed dark:text-gray-300">
            {{ promptMessage.detail }}
          </div>

          <!-- Privacy Note -->
          <div class="mt-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <div class="flex items-start gap-2">
              <svg class="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <p class="text-xs text-blue-700 dark:text-blue-400">
                您可以在设置中随时查看、修改或撤销此授权。
              </p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-3 border-t border-gray-200 p-6 pt-4 dark:border-gray-700">
          <button
            class="hover:bg-primary-dark w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-white font-medium transition-colors"
            @click="handleGrant"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            同意并启用
          </button>

          <div class="flex gap-3">
            <button
              class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600 transition-colors dark:border-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
              @click="handleDeny"
            >
              暂不使用
            </button>
            <button
              class="flex-1 border border-primary/30 rounded-lg px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/5"
              @click="handleLearnMore"
            >
              了解更多
            </button>
          </div>
        </div>

        <!-- Deny Warning -->
        <div
          v-if="authState.denyCount > 0"
          class="border-t border-yellow-100 bg-yellow-50 px-6 py-3 dark:border-yellow-900/30 dark:bg-yellow-900/20"
        >
          <p class="text-center text-xs text-yellow-700 dark:text-yellow-400">
            提示：您已拒绝 {{ authState.denyCount }} 次，再次拒绝后将暂时不再提示
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>
