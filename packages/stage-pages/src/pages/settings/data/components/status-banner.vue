<script setup lang="ts">
import type { DataSettingsStatusTone } from '../status'

interface Props {
  message: string
  tone: DataSettingsStatusTone
}

defineProps<Props>()
</script>

<template>
  <div
    :class="[
      'rounded-xl border px-4 py-3 text-sm shadow-sm',
      tone === 'success' && 'border-emerald-300/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
      tone === 'error' && 'border-red-300/80 bg-red-50/80 text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200',
      tone === 'neutral' && 'border-neutral-200/70 bg-white/70 text-neutral-700 dark:border-neutral-700/70 dark:bg-neutral-900/60 dark:text-neutral-200',
    ]"
  >
    {{ message }}
  </div>
</template>
