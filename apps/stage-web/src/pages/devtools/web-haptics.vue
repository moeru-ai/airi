<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useWebHaptics } from 'web-haptics/vue'

const presetButtons = [
  {
    name: 'success',
    label: 'Success',
    icon: 'i-solar:check-circle-bold-duotone',
    variant: 'primary',
  },
  {
    name: 'nudge',
    label: 'Nudge',
    icon: 'i-solar:hand-stars-bold-duotone',
    variant: 'caution',
  },
  {
    name: 'error',
    label: 'Error',
    icon: 'i-solar:danger-triangle-bold-duotone',
    variant: 'danger',
  },
  {
    name: 'buzz',
    label: 'Buzz',
    icon: 'i-solar:alarm-bold-duotone',
    variant: 'secondary',
  },
] as const

const { trigger, isSupported } = useWebHaptics({
  debug: true,
})
</script>

<template>
  <div :class="['min-h-full flex flex-col gap-4 pb-12']">
    <div
      :class="[
        'inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-500 w-fit',
        isSupported
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
      ]"
    >
      <span :class="[isSupported ? 'i-solar:check-circle-bold-duotone' : 'i-solar:danger-circle-bold-duotone']" />
      <span>isSupported: {{ isSupported ? 'true' : 'false' }}</span>
    </div>

    <div :class="['flex flex-row gap-3']">
      <div
        v-for="preset in presetButtons"
        :key="preset.name"
        :class="['flex flex-1']"
      >
        <Button
          block
          size="md"
          shape="rounded"
          :variant="preset.variant"
          :icon="preset.icon"
          @click="trigger(preset.name)"
        >
          {{ preset.label }}
        </Button>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Web Haptics
  subtitleKey: tamagotchi.settings.devtools.title
</route>
