<script setup lang="ts">
import { SESSION_DEFAULT_PREFERENCES, useChatFeaturesStore } from '@proj-airi/stage-ui/stores/chat/features-store'
import { FieldCheckbox, GhostButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const defaults = useChatFeaturesStore()
const { t } = useI18n()
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-6']">
    <div :class="['flex justify-end']">
      <GhostButton size="sm" @click="defaults.resetState()">
        <span aria-hidden="true" :class="['i-solar:restart-outline size-3.5']" />
        {{ t('settings.session-features.restore-all') }}
      </GhostButton>
    </div>
    <section
      v-for="key in SESSION_DEFAULT_PREFERENCES" :key="key"
      :aria-label="t(`settings.session-features.features.${key}.label`)"
      :data-settings-search="key"
      :class="['flex flex-col gap-3', 'rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900']"
    >
      <FieldCheckbox
        :model-value="defaults.defaults[key]"
        :label="t(`settings.session-features.features.${key}.label`)"
        :description="t(`settings.session-features.features.${key}.${key === 'tasks' ? 'detail' : 'description'}`)"
        @update:model-value="defaults.setDefaults({ [key]: $event })"
      />
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.session-features.title
  subtitleKey: settings.pages.system.title
  descriptionKey: settings.session-features.description
  icon: i-solar:checklist-minimalistic-bold-duotone
  stageTransition:
    name: slide
</route>
