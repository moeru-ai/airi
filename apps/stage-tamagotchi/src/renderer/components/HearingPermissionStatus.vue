<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { electron } from '../../shared/electron'
import { useElectronEventaInvoke } from '../composables/electron-vueuse'

const status = ref<string>('unknown')
const loading = ref(false)
const error = ref<string>('')

const getMediaAccessStatus = useElectronEventaInvoke(electron.systemPreferences.getMediaAccessStatus)
const askForMediaAccess = useElectronEventaInvoke(electron.systemPreferences.askForMediaAccess)

async function refreshStatus() {
  try {
    loading.value = true
    error.value = ''
    const s = await getMediaAccessStatus(['microphone'])
    status.value = String(s)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}

async function requestAccess() {
  try {
    loading.value = true
    error.value = ''
    await askForMediaAccess(['microphone'])
    await refreshStatus()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  if (window?.electron)
    refreshStatus()
})
</script>

<template>
  <div class="mt-4 border border-neutral-200 rounded-lg p-3 dark:border-neutral-700">
    <div class="mb-2 text-sm text-neutral-600 font-medium dark:text-neutral-300">
      Microphone Permission
    </div>
    <div class="flex items-center gap-3">
      <div v-if="loading" class="i-solar:spinner-line-duotone animate-spin text-neutral-500" />
      <div
        v-else :class="{
          'text-green-600 dark:text-green-400': status === 'granted',
          'text-red-600 dark:text-red-400': status === 'denied' || status === 'restricted',
          'text-amber-600 dark:text-amber-400': status === 'not-determined' || status === 'unknown',
        }"
      >
        Status: {{ status }}
      </div>
      <button
        v-if="status !== 'granted'"
        class="ml-auto rounded-md bg-neutral-200 px-3 py-1 text-sm text-neutral-800 dark:bg-neutral-800 hover:bg-neutral-300 dark:text-neutral-200 dark:hover:bg-neutral-700"
        @click="requestAccess"
      >
        Request Access
      </button>
    </div>
    <div v-if="error" class="mt-2 text-xs text-red-500">
      {{ error }}
    </div>
  </div>
</template>
