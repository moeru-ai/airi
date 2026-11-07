<script setup lang="ts">
import { FieldCheckbox, FieldCombobox } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { useProviderGenerationSettings } from '../../../composables/use-provider-generation-settings'
import { useProviderConfigStore } from '../../../stores/providers/config'

const props = defineProps<{ providerId: string }>()
const { t } = useI18n()
const store = useProviderConfigStore()
const { schemaError, protocolField, searchField, protocolOptions, protocol, webSearch } = useProviderGenerationSettings(() => props.providerId)

/**
 * Triggering workflow:
 * Combobox/Checkbox `update:modelValue` -> {@link setField} -> {@link store.patchProviderConfig}.
 */
async function setField(...[key, value]: ['api', string | undefined] | ['webSearch', boolean]) {
  // Clearing the combobox does not select a protocol. Keep the current choice.
  if (value === undefined)
    return
  // Apply only the changed field on the leader. The action ignores a provider
  // removed by another window before this event arrives.
  await store.patchProviderConfig(props.providerId, { [key]: value })
}
</script>

<template>
  <p v-if="schemaError" role="alert">
    {{ schemaError }}
  </p>
  <FieldCombobox
    v-if="protocolField"
    layout="vertical"
    :model-value="protocol"
    :options="protocolOptions"
    :label="t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.label')"
    :description="t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.description')"
    @update:model-value="setField('api', $event)"
  />
  <FieldCheckbox
    v-if="searchField"
    :model-value="webSearch"
    :disabled="searchField.meta()?.disabled === true"
    :label="t('settings.pages.providers.catalog.edit.config.common.fields.field.web-search.label')"
    :description="t('settings.pages.providers.catalog.edit.config.common.fields.field.web-search.description')"
    @update:model-value="setField('webSearch', $event)"
  />
</template>
