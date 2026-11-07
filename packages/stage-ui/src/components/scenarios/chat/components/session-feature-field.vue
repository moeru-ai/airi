<script setup lang="ts">
import type { SessionFeatureBlocker } from '../../../../composables/use-session-feature-availability'
import type { SessionFeatureSetting } from '../session-feature-groups'

import { FieldCheckbox } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  feature: SessionFeatureSetting
  value: boolean
  disabled?: boolean
  blocker?: SessionFeatureBlocker
}>()
const emit = defineEmits<{
  change: [value: boolean]
}>()
const { t } = useI18n()
const label = computed(() => props.feature.startsWith('tools.')
  ? t(`settings.session-features.${props.feature}`)
  : t(`settings.session-features.features.${props.feature}.label`))
</script>

<template>
  <FieldCheckbox
    :class="['min-h-12 min-w-0 justify-center py-1']"
    :model-value="value && !blocker"
    :disabled="disabled || !!blocker"
    :label="label"
    @update:model-value="emit('change', $event)"
  >
    <template v-if="blocker" #description>
      {{ t(`settings.session-features.blocked.${blocker.reason}`) }}
      <RouterLink
        v-if="blocker.settingsPath"
        :to="blocker.settingsPath"
        :class="['ml-1 rounded text-primary-600 underline underline-offset-2 dark:text-primary-400', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
      >
        {{ t('settings.session-features.open-settings') }}
      </RouterLink>
    </template>
  </FieldCheckbox>
</template>
