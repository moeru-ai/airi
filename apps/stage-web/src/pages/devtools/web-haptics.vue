<script setup lang="ts">
import { Alert, Button } from '@proj-airi/ui'
import { useWebHaptics } from 'web-haptics/vue'

const presetButtons = [
  {
    name: 'success',
    label: 'Success',
    icon: 'i-solar:check-circle-bold-duotone',
    color: 'neutral',
    variant: 'secondary',
  },
  {
    name: 'nudge',
    label: 'Nudge',
    icon: 'i-solar:hand-stars-bold-duotone',
    color: 'orange',
    variant: 'primary',
  },
  {
    name: 'error',
    label: 'Error',
    icon: 'i-solar:danger-triangle-bold-duotone',
    color: 'red',
    variant: 'primary',
  },
  {
    name: 'buzz',
    label: 'Buzz',
    icon: 'i-solar:alarm-bold-duotone',
    color: 'neutral',
    variant: 'secondary',
  },
] as const

const { trigger, isSupported } = useWebHaptics({
  debug: true,
})
</script>

<template>
  <div :class="['min-h-full flex flex-col gap-4 pb-12']">
    <Alert :tone="isSupported ? 'success' : 'warning'">
      isSupported: {{ isSupported ? 'true' : 'false' }}
    </Alert>

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
          :color="preset.color"
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
