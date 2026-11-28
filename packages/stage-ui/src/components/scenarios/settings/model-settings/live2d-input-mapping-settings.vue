<script setup lang="ts">
import type { Live2DInputMapping, Live2DInputMappingMode } from '@proj-airi/stage-ui-live2d'

import { Alert, FieldSelect, Skeleton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  mapping?: Live2DInputMapping
  loading?: boolean
  disabled?: boolean
}>(), {
  loading: false,
  disabled: false,
})

const mode = defineModel<Live2DInputMappingMode>({ required: true })
const { t } = useI18n()
const canEnable = computed(() => props.mapping?.status === 'ready' && props.mapping.bindings.length > 0)
const mappingOptions = computed(() => [
  { value: 'default' as const, label: t('settings.live2d.animation.input-mapping.options.default') },
  { value: 'model' as const, label: t('settings.live2d.animation.input-mapping.options.model'), disabled: !canEnable.value },
])
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <FieldSelect
      v-model="mode"
      :label="t('settings.live2d.animation.input-mapping.title')"
      :description="t('settings.live2d.animation.input-mapping.description')"
      :disabled="props.disabled || props.loading"
      :options="mappingOptions"
      layout="vertical"
    />
    <div v-if="props.loading" role="status" :class="['flex flex-col gap-2']">
      <span :class="['sr-only']">{{ t('settings.live2d.animation.input-mapping.loading') }}</span>
      <Skeleton :class="['h-3 w-3/4 rounded']" />
      <Skeleton :class="['h-3 w-full rounded']" />
    </div>
    <Alert v-else-if="props.mapping?.status === 'invalid'" tone="warning">
      {{ t('settings.live2d.animation.input-mapping.invalid') }}
    </Alert>
    <Alert v-else-if="props.mapping?.status === 'unsupported'" tone="warning">
      {{ t('settings.live2d.animation.input-mapping.unsupported') }}
    </Alert>
    <div v-else-if="canEnable" :class="['flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400']">
      <p>{{ t('settings.live2d.animation.input-mapping.available', { count: props.mapping?.bindings.length }) }}</p>
      <p v-if="props.mapping?.issues.length">
        {{ t('settings.live2d.animation.input-mapping.partial') }}
      </p>
      <p>{{ t('settings.live2d.animation.input-mapping.limitations') }}</p>
    </div>
    <p v-else :class="['rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400']">
      {{ t('settings.live2d.animation.input-mapping.missing') }}
    </p>
  </div>
</template>
