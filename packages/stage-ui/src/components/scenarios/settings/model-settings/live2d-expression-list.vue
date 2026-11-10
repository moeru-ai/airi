<script setup lang="ts">
import { Checkbox, IconButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  items: Array<{
    name: string
    fileName: string
    active: boolean
    availableToAiri: boolean
    activationDisabled: boolean
    parameterCount: number
  }>
}>()

defineEmits<{
  setActive: [name: string, active: boolean]
  setAvailableToAiri: [name: string, available: boolean]
}>()

const { t } = useI18n()

function activationLabel(name: string, active: boolean) {
  return t(active
    ? 'settings.live2d.expressions.actions.deactivate'
    : 'settings.live2d.expressions.actions.activate', { name })
}

function availabilityLabel(name: string, available: boolean) {
  return t(available
    ? 'settings.live2d.expressions.actions.hide-from-airi'
    : 'settings.live2d.expressions.actions.show-to-airi', { name })
}
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <div
      v-for="item in items"
      :key="item.name"
      :class="[
        'min-h-24 rounded-xl px-3 py-3',
        'bg-neutral-100/70 dark:bg-neutral-800/60',
      ]"
    >
      <div :class="['flex items-start justify-between gap-3']">
        <div :class="['min-w-0']">
          <div :class="['truncate text-sm font-medium']">
            {{ item.name }}
          </div>
          <code :class="['mt-0.5 block truncate text-xs opacity-50']">
            {{ item.fileName }}
          </code>
        </div>
        <Checkbox
          :model-value="item.availableToAiri"
          :aria-label="availabilityLabel(item.name, item.availableToAiri)"
          @update:model-value="$emit('setAvailableToAiri', item.name, $event)"
        />
      </div>

      <div :class="['mt-3 flex items-center justify-between gap-3']">
        <span :class="['text-xs opacity-60']">
          {{ t('settings.live2d.expressions.parameter-count', { count: item.parameterCount }) }}
        </span>

        <IconButton
          :icon="item.active ? 'i-mingcute:stop-fill' : 'i-mingcute:play-fill'"
          :disabled="item.activationDisabled"
          :aria-label="activationLabel(item.name, item.active)"
          :aria-pressed="item.active"
          :class="[
            'size-8 rounded-lg text-lg',
            item.active
              ? 'text-primary-600 dark:text-primary-300'
              : 'opacity-60 hover:bg-neutral-200/70 hover:opacity-100 dark:hover:bg-neutral-700/70',
          ]"
          @click="$emit('setActive', item.name, !item.active)"
        />
      </div>
    </div>
  </div>
</template>
