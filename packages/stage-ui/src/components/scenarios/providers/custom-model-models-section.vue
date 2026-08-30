<script setup lang="ts">
import { Button, FieldCombobox, FieldInput } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useCustomModelEditorContext } from '../../../composables/use-custom-model-editor'

const { t } = useI18n()
const editor = useCustomModelEditorContext()

const modelOptions = computed(() =>
  editor.draft.models
    .map(model => model.id.trim())
    .filter(Boolean)
    .map(id => ({ label: id, value: id })),
)

function addModelRow() {
  editor.draft.models = [...editor.draft.models, { id: '', name: '' }]
}

function removeModelRow(index: number) {
  const rows = editor.draft.models.filter((_, rowIndex) => rowIndex !== index)
  editor.draft.models = rows.length > 0 ? rows : [{ id: '', name: '' }]
  if (!editor.draft.models.some(model => model.id.trim() === editor.draft.selectedModelId))
    editor.draft.selectedModelId = editor.draft.models[0]?.id ?? ''
}

const discoveryMessage = computed(() =>
  t(`settings.pages.providers.provider.custom-model.discovery.status.${editor.discoveryStatus}`),
)
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <div :class="['flex', 'flex-col', 'gap-2']">
      <div :class="['text-sm', 'font-medium']">
        {{ t('settings.pages.providers.provider.custom-model.fields.models.label') }}
      </div>
      <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ t('settings.pages.providers.provider.custom-model.fields.models.description') }}
      </div>
      <div
        v-for="(model, index) in editor.draft.models"
        :key="index"
        :class="['flex', 'items-center', 'gap-2']"
      >
        <FieldInput
          v-model="model.id"
          :placeholder="t('settings.pages.providers.provider.custom-model.fields.models.id-placeholder')"
          :hide-required-mark="true"
        />
        <FieldInput
          v-model="model.name"
          :placeholder="t('settings.pages.providers.provider.custom-model.fields.models.name-placeholder')"
          :hide-required-mark="true"
        />
        <button
          type="button"
          :class="['i-solar:minus-circle-line-duotone', 'size-6', 'text-red-500']"
          @click="removeModelRow(index)"
        />
      </div>
      <Button size="sm" variant="secondary" @click="addModelRow">
        {{ t('settings.pages.providers.provider.custom-model.fields.models.add') }}
      </Button>
    </div>

    <div :class="['flex', 'flex-col', 'gap-2']">
      <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
        <div :class="['text-sm', 'font-medium']">
          {{ t('settings.pages.providers.provider.custom-model.discovery.title') }}
        </div>
        <Button
          size="sm"
          :loading="editor.isDiscovering"
          :disabled="editor.isDiscovering || !editor.canDiscover"
          data-testid="custom-model-discover"
          @click="editor.runDiscovery()"
        >
          {{ t('settings.pages.providers.provider.custom-model.discovery.action') }}
        </Button>
      </div>
      <div
        data-testid="custom-model-discovery-status"
        :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-300']"
      >
        {{ discoveryMessage }}
      </div>
      <div
        v-if="editor.discoveryError"
        :class="['text-sm', 'text-red-600', 'dark:text-red-400']"
      >
        {{ t(`settings.pages.providers.provider.custom-model.errors.connection.${editor.discoveryError.code}`) }}
        <span v-if="editor.discoveryError.message"> {{ editor.discoveryError.message }}</span>
      </div>
    </div>

    <FieldCombobox
      v-model="editor.draft.selectedModelId"
      :label="t('settings.pages.providers.provider.custom-model.generation.model')"
      :options="modelOptions"
    />
  </div>
</template>
