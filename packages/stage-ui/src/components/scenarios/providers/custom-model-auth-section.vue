<script setup lang="ts">
import { FieldCombobox, Input } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ProviderApiKeyInput from './provider-api-key-input.vue'

import { useCustomModelEditorContext } from '../../../composables/use-custom-model-editor'

const { t } = useI18n()
const editor = useCustomModelEditorContext()

const authOptions = computed(() => [
  {
    label: t('settings.pages.providers.provider.custom-model.fields.auth-type.options.bearer'),
    value: 'bearer',
  },
  {
    label: t('settings.pages.providers.provider.custom-model.fields.auth-type.options.x-api-key'),
    value: 'x-api-key',
  },
  {
    label: t('settings.pages.providers.provider.custom-model.fields.auth-type.options.none'),
    value: 'none',
  },
])

function removeHeaderRow(index: number) {
  const rows = editor.draft.headers.filter((_, rowIndex) => rowIndex !== index)
  editor.draft.headers = rows.length > 0 ? rows : [{ key: '', value: '' }]
}
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <FieldCombobox
      v-model="editor.draft.authType"
      :label="t('settings.pages.providers.provider.custom-model.fields.auth-type.label')"
      :options="authOptions"
    />

    <ProviderApiKeyInput
      v-if="editor.draft.authType !== 'none'"
      v-model="editor.draft.authSecret"
      :provider-name="t('settings.pages.providers.provider.custom-model.title')"
      :label="t('settings.pages.providers.provider.custom-model.fields.auth-secret.label')"
      :description="t('settings.pages.providers.provider.custom-model.fields.auth-secret.description')"
      :placeholder="t('settings.pages.providers.provider.custom-model.fields.auth-secret.placeholder')"
      required
    />

    <div :class="['flex', 'flex-col', 'gap-2']">
      <div :class="['text-sm', 'font-medium']">
        {{ t('settings.pages.providers.provider.custom-model.fields.headers.label') }}
      </div>
      <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ t('settings.pages.providers.provider.custom-model.fields.headers.description') }}
      </div>
      <div
        v-for="(header, index) in editor.draft.headers"
        :key="index"
        :class="['flex', 'items-center', 'gap-2']"
      >
        <Input
          v-model="header.key"
          :placeholder="t('settings.pages.providers.provider.custom-model.fields.headers.key-placeholder')"
          :class="['w-1/2']"
          autocomplete="off"
        />
        <Input
          v-model="header.value"
          type="password"
          :placeholder="t('settings.pages.providers.provider.custom-model.fields.headers.value-placeholder')"
          :class="['w-1/2']"
          autocomplete="off"
          data-testid="custom-model-header-secret"
        />
        <button
          type="button"
          :class="['i-solar:minus-circle-line-duotone', 'size-6', 'text-red-500']"
          @click="removeHeaderRow(index)"
        />
      </div>
    </div>
  </div>
</template>
