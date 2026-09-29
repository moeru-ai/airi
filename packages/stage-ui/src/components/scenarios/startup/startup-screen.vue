<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{ failed?: boolean, error?: string, transparent?: boolean }>()

const { t } = useI18n()

function reload() {
  window.location.reload()
}
</script>

<template>
  <main
    :class="[
      'fixed inset-0 z-50',
      'flex flex-col items-center justify-center gap-5',
      transparent
        ? 'bg-transparent text-neutral-900 dark:text-neutral-100'
        : 'bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100',
    ]"
    aria-live="polite"
  >
    <div :class="['text-4xl font-semibold tracking-wide', transparent ? 'rounded-xl bg-white/85 p-4 shadow-md backdrop-blur-md dark:bg-neutral-900/85' : '']">
      AIRI
    </div>
    <div v-if="!failed" :class="['flex items-center gap-3', 'text-sm text-neutral-600 dark:text-neutral-400']">
      <span :class="['i-svg-spinners:ring-resize']" aria-hidden="true" />
      {{ t('stage.startup.loading') }}
    </div>
    <div v-else :class="['flex flex-col items-center gap-4', 'max-w-md px-6 text-center']">
      <p :class="['m-0 text-sm']">
        {{ t('stage.startup.failed') }}
      </p>
      <p v-if="error" :class="['m-0 text-xs text-neutral-500']">
        {{ error }}
      </p>
      <Button :label="t('stage.startup.reload')" @click="reload" />
    </div>
  </main>
</template>
