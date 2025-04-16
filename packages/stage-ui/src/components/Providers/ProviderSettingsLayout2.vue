<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PageHeader from '../../components/Layouts/PageHeader.vue'

defineProps<{
  providerName: string
  providerIcon?: string
  providerIconColor?: string
  onBack?: () => void
}>()

const { t } = useI18n()
</script>

<template>
  <PageHeader
    :title="providerName"
    :subtitle="t('settings.pages.providers.title')"
  />
  <slot />
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
  >
    <div text="60" :class="providerIcon || providerIconColor" />
  </div>
</template>
