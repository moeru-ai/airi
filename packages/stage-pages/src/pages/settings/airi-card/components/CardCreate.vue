<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <!-- Style from ui/InputFile component, may be centralized later -->
  <div
    relative
    class="min-h-[120px] flex flex-col cursor-pointer items-center justify-center border-neutral-200 rounded-xl bg-white/60 p-6 dark:border-neutral-700 hover:border-primary-300 dark:bg-black/30 hover:bg-white/80 dark:hover:border-primary-700 dark:hover:bg-black/40"
    border="solid 2"
    transition="all duration-300"
    cursor-pointer opacity-95
    hover="scale-100 opacity-100 shadow-md dark:shadow-lg"
  >
    <div i-solar:add-square-line-duotone mb-4 text-5xl text="neutral-400 dark:neutral-500" />
    <p font-medium text="neutral-600 dark:neutral-300">
      {{ t('settings.pages.card.create_card') }}
    </p>
  </div>
</template>
