<script setup lang="ts">
import type { DevicePermissionStatus } from '../../../stores/device-permissions'

import { Button } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  title: string
  description: string
  /** Undefined until the first check finishes. */
  status?: DevicePermissionStatus
  busy: boolean
}>()

const emit = defineEmits<{
  request: []
}>()

const { t } = useI18n()

const granted = computed(() => props.status === 'granted')
// The system asks only once. After a denial, the action opens the system settings instead.
const actionLabel = computed(() => props.status === 'denied'
  ? t('settings.dialogs.onboarding.permissions.openSettingsAction')
  : t('settings.dialogs.onboarding.permissions.requestAction'))
</script>

<template>
  <section :class="['rounded-xl p-4', 'bg-neutral-50 dark:bg-neutral-800/50']">
    <div :class="['flex items-start justify-between gap-3', { 'mb-3': !granted }]">
      <div>
        <h3 :class="['text-sm font-semibold', 'text-neutral-800 dark:text-neutral-100']">
          {{ props.title }}
        </h3>
        <p :class="['mt-1 text-xs', 'text-neutral-600 dark:text-neutral-300']">
          {{ props.description }}
        </p>
      </div>
      <div
        v-if="props.status"
        :class="['flex shrink-0 items-center gap-1.5 text-xs', 'text-neutral-500 dark:text-neutral-400']"
        role="status"
      >
        <span
          aria-hidden="true"
          :class="[
            'h-5 w-5',
            granted
              ? 'i-mingcute:check-circle-line text-green-700 dark:text-green-400'
              : 'i-mingcute:close-circle-line text-red-600 dark:text-red-400',
          ]"
        />
        <span>{{ granted ? t('settings.dialogs.onboarding.permissions.stateGranted') : t('settings.dialogs.onboarding.permissions.stateNotGranted') }}</span>
      </div>
    </div>
    <Button
      v-if="props.status && !granted"
      :label="actionLabel"
      :loading="props.busy"
      @click="emit('request')"
    />
  </section>
</template>
