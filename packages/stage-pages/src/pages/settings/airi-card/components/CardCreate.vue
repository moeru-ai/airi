<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <!-- Style from ui/InputFileCard, may be centralized later -->
  <div
    :class="[
      'relative min-h-[96px] sm:min-h-[120px]',
      'flex flex-col cursor-pointer items-center justify-center',
      'rounded-xl border-2 border-solid p-4 sm:p-6',
      'border-neutral-200 bg-white/60 dark:border-neutral-700 dark:bg-black/30',
      'hover:border-primary-300 hover:bg-white/80 dark:hover:border-primary-700 dark:hover:bg-black/40',
      'transition-all duration-300',
      'opacity-95 hover:scale-100 hover:opacity-100 hover:shadow-md dark:hover:shadow-lg',
    ]"
  >
    <div i-solar:add-square-line-duotone :class="['mb-1 text-3xl text-neutral-400 sm:mb-4 sm:text-5xl dark:text-neutral-500']" />
    <p :class="['text-sm font-medium text-neutral-600 sm:text-base dark:text-neutral-300']">
      {{ t('settings.pages.card.create_card') }}
    </p>
  </div>
</template>
