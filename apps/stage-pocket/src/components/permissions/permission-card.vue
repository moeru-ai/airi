<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  title: string
  description: string
  actionLabel: string
  granted: boolean
  disabled: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  request: []
}>()

const { t } = useI18n()

const statusLabel = computed(() => props.granted
  ? t('settings.dialogs.onboarding.permissions.stateGranted')
  : t('settings.dialogs.onboarding.permissions.stateNotGranted'),
)

const statusIcon = computed(() => props.granted
  ? 'i-solar:check-circle-linear text-green-700 dark:text-green-400'
  : 'i-solar:close-circle-linear text-red-600 dark:text-red-400',
)
</script>

<template>
  <section
    :class="[
      'rounded-xl p-4',
      'border border-neutral-200 bg-neutral-50',
      'dark:border-neutral-700 dark:bg-neutral-800/50',
    ]"
  >
    <div :class="['flex items-start justify-between gap-3', { 'mb-3': !props.granted }]">
      <div>
        <h3 :class="['text-sm font-semibold', 'text-neutral-800 dark:text-neutral-100']">
          {{ props.title }}
        </h3>
        <p :class="['mt-1 text-xs', 'text-neutral-600 dark:text-neutral-300']">
          {{ props.description }}
        </p>
      </div>
      <div
        :class="['flex shrink-0 items-center gap-1.5 text-xs', 'text-neutral-500 dark:text-neutral-400']"
        role="status"
      >
        <span :class="[statusIcon, 'h-5 w-5']" />
        <span>{{ statusLabel }}</span>
      </div>
    </div>
    <Button
      v-if="!props.granted"
      :label="props.actionLabel"
      :disabled="props.disabled"
      @click="emit('request')"
    />
  </section>
</template>
