<script setup lang="ts">
import { provide, ref } from 'vue'

const isActive = ref(false)

// Show notification for a specific duration
function showNotification(duration = 2000) {
  isActive.value = true

  // Hide after duration
  setTimeout(() => {
    isActive.value = false
  }, duration)
}

// Provide showNotification method to descendants
provide('showNotification', showNotification)
</script>

<template>
  <div
    class="fixed bottom-4 right-4 z-50 transform rounded bg-primary p-3 px-4 text-white shadow-lg transition-transform duration-300"
    :class="isActive ? 'translate-y-0' : 'translate-y-24'"
  >
    Prompt copied to clipboard!
  </div>
</template>
