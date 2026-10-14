<script setup lang="ts">
import { OverlayButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  /** Name of the active card, shown in the message. */
  name: string
}>()

defineEmits<{
  select: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    :class="[
      'pointer-events-none absolute inset-0 z-20 p-6',
      'flex items-center justify-center',
    ]"
  >
    <div
      data-testid="stage-avatar-model-missing"
      :class="[
        'pointer-events-auto max-w-xs',
        'flex flex-col items-center gap-3 px-5 py-4',
        'rounded-2xl text-center backdrop-blur-md',
        'bg-neutral-50/80 text-neutral-900 dark:bg-neutral-900/70 dark:text-neutral-50',
      ]"
    >
      <div :class="['text-sm font-medium']">
        {{ t('stage.avatar-model-missing.title', { name }) }}
      </div>
      <div :class="['text-xs opacity-70']">
        {{ t('stage.avatar-model-missing.description', { name }) }}
      </div>
      <div :class="['flex']">
        <OverlayButton
          icon="i-solar:user-rounded-linear"
          :label="t('stage.avatar-model-missing.select')"
          @click="$emit('select')"
        />
      </div>
    </div>
  </div>
</template>
