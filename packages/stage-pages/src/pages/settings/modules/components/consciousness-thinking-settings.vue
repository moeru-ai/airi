<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { FieldCheckbox } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  canDisableThinking: boolean
}>()

const disableThinking = defineModel<boolean>({ required: true })
const { t } = useI18n()
</script>

<template>
  <section :class="['flex', 'flex-col', 'gap-4', 'border-t', 'border-neutral-200', 'pt-4', 'dark:border-neutral-800']">
    <div>
      <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
        {{ t('settings.pages.modules.consciousness.sections.section.thinking.title') }}
      </h2>
      <div :class="['text-neutral-400', 'dark:text-neutral-400']">
        {{ t('settings.pages.modules.consciousness.sections.section.thinking.description') }}
      </div>
    </div>

    <FieldCheckbox
      v-model="disableThinking"
      :label="t('settings.pages.modules.consciousness.sections.section.thinking.disable.label')"
      :description="t('settings.pages.modules.consciousness.sections.section.thinking.disable.description')"
    />

    <Alert v-if="disableThinking && !canDisableThinking" type="warning">
      <template #title>
        {{ t('settings.pages.modules.consciousness.sections.section.thinking.unsupported.title') }}
      </template>
      <template #content>
        {{ t('settings.pages.modules.consciousness.sections.section.thinking.unsupported.description') }}
      </template>
    </Alert>
  </section>
</template>
