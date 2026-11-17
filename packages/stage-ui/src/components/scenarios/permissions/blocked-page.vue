<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PermissionPageLayout from './permission-page-layout.vue'

/**
 * Shows a page whose required pages are not done, for example the voiceprint while the microphone is not allowed.
 * The flow shows it in place of the page, so the page itself does not check its requirements.
 */
defineProps<{
  /** The name of the page, for example "Voiceprint". */
  page: string
  /** The names of the required pages that are not done, as one phrase. */
  requirement: string
  icon: string
}>()

const { t } = useI18n()
</script>

<template>
  <PermissionPageLayout
    :title="t('settings.dialogs.onboarding.permissions.flow.blocked.title', { page, requirement })"
    :description="t('settings.dialogs.onboarding.permissions.flow.blocked.body', { requirement })"
  >
    <template #stage>
      <div :class="['size-33 flex items-center justify-center rounded-full', 'bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500']">
        <span :class="[icon, 'size-12']" aria-hidden="true" />
      </div>
    </template>
  </PermissionPageLayout>
</template>
