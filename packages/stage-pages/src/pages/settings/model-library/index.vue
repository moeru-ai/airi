<script setup lang="ts">
import { ModelLibrary } from '@proj-airi/stage-ui/components/scenarios/settings/model-library'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.models.library.hint') }}
    </p>
    <!-- The settings editor shows the model of the stage, so the library opens it only for that model. -->
    <ModelLibrary @edit="router.push('/settings/models')" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.models.library.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.models.library.description
  icon: i-solar:gallery-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
