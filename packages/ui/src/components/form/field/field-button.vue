<script setup lang="ts">
import { Button } from '../../misc'

const props = defineProps<{
  label: string
  description?: string
  buttonLabel: string
  buttonIcon?: string
  disabled?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <div :class="['flex items-center gap-4']">
    <div :class="['min-w-0 flex-1']">
      <div :class="['flex items-center gap-1 text-sm font-medium']">
        <slot name="label">
          {{ props.label }}
        </slot>
      </div>
      <div :class="['text-xs opacity-60']">
        <slot name="description">
          {{ props.description }}
        </slot>
      </div>
    </div>
    <Button
      :label="props.buttonLabel"
      :icon="props.buttonIcon"
      :disabled="props.disabled"
      :loading="props.loading"
      size="sm"
      variant="secondary"
      @click="emit('click', $event)"
    />
  </div>
</template>
