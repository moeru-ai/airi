<script setup lang="ts">
import { useFluxStatus } from '@proj-airi/stage-ui/composables/use-flux-status'
import { AIRI_FLUX_URL } from '@proj-airi/stage-ui/constants/public-links'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const { visible, subscribed, low, valueLabel, icon } = useFluxStatus()
</script>

<template>
  <!-- One click to Flux: the Capacitor percent for a subscriber, otherwise the Flux balance. Hidden when signed out. -->
  <RouterLink
    v-if="visible"
    :to="AIRI_FLUX_URL"
    data-testid="header-flux"
    :aria-label="`${t('settings.pages.flux.title')}: ${valueLabel}`"
    :class="[
      'h-10 flex items-center gap-1.5 rounded-full border-2 px-3 shadow-sm backdrop-blur-md',
      'text-sm font-medium no-underline outline-none',
      'border-neutral-100/60 bg-neutral-50/70 dark:border-neutral-800/30 dark:bg-neutral-800/70',
      'hover:bg-neutral-100 dark:hover:bg-neutral-800',
      'focus-visible:ring-2 focus-visible:ring-primary-500',
      'transition-colors duration-200 ease-in-out',
      subscribed && low ? 'text-orange-600 dark:text-orange-300' : 'text-primary-600 dark:text-primary-300',
    ]"
  >
    <div :class="[icon, 'size-4 shrink-0']" />
    <span :class="['tabular-nums']">{{ valueLabel }}</span>
  </RouterLink>
</template>
