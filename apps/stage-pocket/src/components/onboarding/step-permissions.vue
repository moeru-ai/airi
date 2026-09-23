<script setup lang="ts">
import { Button, ScrollableArea } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import PermissionsPanel from '../permissions/permissions-panel.vue'

interface Props {
  onNext: () => Promise<void> | void
  onPrevious: () => void
}

const props = defineProps<Props>()
const { t } = useI18n()
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="props.onPrevious">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.permissions.title') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <ScrollableArea :class="['min-h-0 flex-1']">
      <div :class="['space-y-4']">
        <p class="text-sm text-neutral-600 md:text-base dark:text-neutral-300">
          {{ t('settings.dialogs.onboarding.permissions.description') }}
        </p>

        <PermissionsPanel />

        <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.dialogs.onboarding.permissions.optionalHint') }}
        </p>
      </div>
    </ScrollableArea>

    <Button
      :label="t('settings.dialogs.onboarding.next')"
      @click="props.onNext"
    />
  </div>
</template>
