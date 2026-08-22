<script setup lang="ts">
import { FieldCheckbox } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  thinking: boolean
}>()

const emit = defineEmits<{
  updateThinking: [value: boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <section :class="['flex', 'flex-col', 'gap-4', 'border-t', 'border-neutral-200', 'pt-4', 'dark:border-neutral-800']">
    <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
      {{ t('settings.pages.modules.consciousness.sections.section.model-options.title') }}
    </h2>

    <FieldCheckbox
      :model-value="props.thinking"
      :label="t('settings.pages.modules.consciousness.sections.section.model-options.thinking.label')"
      @update:model-value="emit('updateThinking', $event)"
    />
  </section>
</template>
