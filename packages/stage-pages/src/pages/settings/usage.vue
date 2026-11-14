<script setup lang="ts">
import { FluxUsageHistory } from '@proj-airi/stage-ui/components/scenarios/flux'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const authStore = useAuthStore()
</script>

<template>
  <div :class="['flex min-h-full flex-col gap-4 p-4']">
    <FluxUsageHistory v-if="authStore.isAuthenticated" />
    <RouterLink
      v-else
      to="/settings/account"
      :class="['text-sm text-primary-600 hover:underline dark:text-primary-400']"
    >
      {{ t('settings.pages.flux.usage.signIn') }}
    </RouterLink>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  onboarding: false
  titleKey: settings.pages.flux.audit.title
  icon: i-solar:history-bold-duotone
  settingsEntry: false
</route>
