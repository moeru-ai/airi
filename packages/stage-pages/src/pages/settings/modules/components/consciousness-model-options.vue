<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { FieldCheckbox } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  canDisableThinking: boolean
}>()

const thinking = defineModel<boolean>({ required: true })
const { t } = useI18n()
</script>

<template>
  <section :class="['flex', 'flex-col', 'gap-4', 'border-t', 'border-neutral-200', 'pt-4', 'dark:border-neutral-800']">
    <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
      {{ t('settings.pages.modules.consciousness.sections.section.model-options.title') }}
    </h2>

    <FieldCheckbox
      v-model="thinking"
      :label="t('settings.pages.modules.consciousness.sections.section.model-options.thinking.label')"
    />

    <Alert v-if="!thinking && !canDisableThinking" type="warning">
      <template #title>
        {{ t('settings.pages.modules.consciousness.sections.section.model-options.thinking.unsupported.title') }}
      </template>
      <template #content>
        {{ t('settings.pages.modules.consciousness.sections.section.model-options.thinking.unsupported.description') }}
      </template>
    </Alert>
  </section>
</template>
