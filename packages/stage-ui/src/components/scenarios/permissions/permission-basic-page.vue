<script setup lang="ts">
import type { DevicePermission } from '../../../stores/device-permissions'

import { useI18n } from 'vue-i18n'

import PermissionPageLayout from './permission-page-layout.vue'
import PermissionStatusLine from './permission-status-line.vue'

import { permissionIcons } from './permission-icons'

defineProps<{
  permission: DevicePermission
  granted: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <PermissionPageLayout
    :title="t(`settings.dialogs.onboarding.permissions.flow.${permission.kind}.title`)"
    :description="t(`settings.dialogs.onboarding.permissions.flow.${permission.kind}.body`)"
  >
    <PermissionStatusLine v-if="granted" tone="ok">
      {{ t(`settings.dialogs.onboarding.permissions.flow.${permission.kind}.on`) }}
    </PermissionStatusLine>

    <template #stage>
      <div
        :class="[
          'size-33 flex items-center justify-center rounded-full transition-colors duration-300',
          granted
            ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300'
            : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
        ]"
      >
        <span :class="[granted ? 'i-mingcute:check-line animate-bounce-in animate-duration-300' : permissionIcons[permission.kind], 'size-12']" aria-hidden="true" />
      </div>
    </template>
  </PermissionPageLayout>
</template>
