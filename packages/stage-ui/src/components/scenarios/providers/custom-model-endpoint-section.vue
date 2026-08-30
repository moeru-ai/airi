<script setup lang="ts">
import { FieldCombobox, FieldInput } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ProviderBaseUrlInput from './provider-base-url-input.vue'

import { useCustomModelEditorContext } from '../../../composables/use-custom-model-editor'

const { t } = useI18n()
const editor = useCustomModelEditorContext()

const protocolOptions = computed(() => [
  {
    label: t('settings.pages.providers.provider.custom-model.fields.protocol.options.openai-chat-completions'),
    value: 'openai-chat-completions',
  },
  {
    label: t('settings.pages.providers.provider.custom-model.fields.protocol.options.openai-responses'),
    value: 'openai-responses',
  },
  {
    label: t('settings.pages.providers.provider.custom-model.fields.protocol.options.anthropic-messages'),
    value: 'anthropic-messages',
  },
])
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <FieldCombobox
      :model-value="editor.draft.protocol"
      :label="t('settings.pages.providers.provider.custom-model.fields.protocol.label')"
      :options="protocolOptions"
      @update:model-value="editor.setProtocol"
    />

    <ProviderBaseUrlInput
      v-model="editor.draft.baseUrl"
      :label="t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label')"
      :description="t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description')"
      :placeholder="t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder')"
      required
    />

    <FieldInput
      v-model="editor.draft.generationPath"
      :label="t('settings.pages.providers.provider.custom-model.fields.generation-path.label')"
      :description="t('settings.pages.providers.provider.custom-model.fields.generation-path.description')"
      :placeholder="t('settings.pages.providers.provider.custom-model.fields.generation-path.placeholder')"
      required
    />

    <FieldInput
      v-model="editor.draft.modelListPath"
      :label="t('settings.pages.providers.provider.custom-model.fields.model-list-path.label')"
      :description="t('settings.pages.providers.provider.custom-model.fields.model-list-path.description')"
      :placeholder="t('settings.pages.providers.provider.custom-model.fields.model-list-path.placeholder')"
    />

    <FieldInput
      v-if="editor.draft.protocol === 'anthropic-messages'"
      v-model="editor.draft.anthropicVersion"
      :label="t('settings.pages.providers.provider.custom-model.fields.anthropic-version.label')"
      :description="t('settings.pages.providers.provider.custom-model.fields.anthropic-version.description')"
      :placeholder="t('settings.pages.providers.provider.custom-model.fields.anthropic-version.placeholder')"
    />

    <div :class="['flex', 'flex-col', 'gap-1', 'text-sm']">
      <div :class="['text-neutral-500', 'dark:text-neutral-400']">
        {{ t('settings.pages.providers.provider.custom-model.url-preview.generation') }}
      </div>
      <code
        data-testid="custom-model-generation-url"
        :class="['break-all', 'text-neutral-800', 'dark:text-neutral-200']"
      >
        {{ editor.urlPreview.generationUrl || t('settings.pages.providers.provider.custom-model.url-preview.invalid') }}
      </code>
      <div :class="['text-neutral-500', 'dark:text-neutral-400']">
        {{ t('settings.pages.providers.provider.custom-model.url-preview.models') }}
      </div>
      <code
        data-testid="custom-model-model-list-url"
        :class="['break-all', 'text-neutral-800', 'dark:text-neutral-200']"
      >
        {{ editor.urlPreview.modelListUrl || t('settings.pages.providers.provider.custom-model.url-preview.invalid') }}
      </code>
    </div>
  </div>
</template>
