<script setup lang="ts">
import type { ApprovalGrantMode } from '../../shared/eventa/terminal-approval'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  lane: 'terminal' | 'computer_use'
  modelValue: ApprovalGrantMode
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [mode: ApprovalGrantMode]
}>()

const { t } = useI18n()

const options = computed(() => [
  { value: 'ask' as const, label: t('tamagotchi.stage.chat-window.computer-tools.approval-mode-ask') },
  { value: 'auto' as const, label: t('tamagotchi.stage.chat-window.computer-tools.approval-mode-auto'), unavailable: true },
  { value: 'full' as const, label: t('tamagotchi.stage.chat-window.computer-tools.approval-mode-full') },
])

function select(mode: ApprovalGrantMode) {
  if (props.disabled || mode === 'auto' || mode === props.modelValue)
    return
  emit('update:modelValue', mode)
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="lane === 'terminal'
      ? t('tamagotchi.stage.chat-window.computer-tools.approval-command')
      : t('tamagotchi.stage.chat-window.computer-tools.approval-computer-use')"
    :class="['flex gap-0.5 rounded-lg bg-neutral-400/6 p-0.5 dark:bg-neutral-950/70']"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :data-testid="`approval-${lane}-${option.value}`"
      :aria-checked="modelValue === option.value"
      :disabled="disabled || option.unavailable"
      :title="option.unavailable ? t('tamagotchi.stage.chat-window.computer-tools.approval-mode-auto-hint') : undefined"
      :class="[
        'min-w-0 flex-1 rounded-md px-2 py-1 text-center text-xs font-medium transition-colors duration-200',
        modelValue === option.value
          ? 'bg-primary-300/50 text-primary-950 dark:bg-primary-400/50 dark:text-primary-50'
          : 'text-neutral-700 dark:text-neutral-200',
        disabled || option.unavailable
          ? 'cursor-not-allowed opacity-45'
          : 'cursor-pointer hover:bg-primary-300/20 dark:hover:bg-primary-400/20',
      ]"
      @click="select(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
