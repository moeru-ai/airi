<script setup lang="ts">
import type { HomeAssistantEntitySummary } from '../../../libs/home-assistant/presentation'

const props = withDefaults(defineProps<{
  entity: HomeAssistantEntitySummary
  /** Whether the device is on the list the settings page is editing. */
  selected: boolean
  /** The state, already translated. The parent owns the wording. */
  stateLabel: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    :disabled="props.disabled"
    :aria-pressed="props.selected"
    :title="props.entity.entityId"
    class="flex items-center gap-3 border-2 rounded-xl p-2.5 text-left transition-colors"
    :class="[
      props.selected
        ? 'border-primary-400 bg-primary-50 dark:border-primary-500/60 dark:bg-primary-900/20'
        : 'border-neutral-100 bg-white hover:border-neutral-200 dark:border-neutral-900 dark:bg-neutral-900/20 dark:hover:border-neutral-800',
      props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
    ]"
    @click="emit('toggle')"
  >
    <div
      class="size-7 shrink-0"
      :class="[
        props.entity.iconClass,
        props.entity.active ? 'text-amber-500 dark:text-amber-400' : 'text-neutral-400 dark:text-neutral-500',
      ]"
    />

    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-medium">
        {{ props.entity.name }}
      </div>
      <div class="truncate text-xs text-neutral-500 dark:text-neutral-400">
        {{ props.stateLabel }}
      </div>
      <!-- The policy stores ids, and two devices can share a name. -->
      <div class="truncate text-[11px] text-neutral-400 dark:text-neutral-500">
        {{ props.entity.entityId }}
      </div>
    </div>

    <div
      class="size-5 shrink-0"
      :class="props.selected
        ? 'i-solar:check-circle-bold text-primary-500'
        : 'border-2 border-solid border-neutral-300 rounded-full dark:border-neutral-600'"
    />
  </button>
</template>
