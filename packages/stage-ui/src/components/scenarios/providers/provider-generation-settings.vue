<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { FieldCheckbox, FieldCombobox } from '@proj-airi/ui'
import { computedAsync } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'

const props = defineProps<{ providerId: string }>()
const { t } = useI18n()
const store = useProviderConfigStore()
const providers = useProviderStore()
const schemaError = ref<string>()

// Catalog schemas own defaults and endpoint-specific availability. Read a snapshot
// before awaiting, so editing a field reloads its metadata without writing defaults.
const request = computed(() => ({
  definition: providers.getProviderDefinition(props.providerId),
  config: { ...store.getProviderConfig(props.providerId) },
}))
const schema = computedAsync<Record<string, z.ZodType> | undefined>(async (onCancel) => {
  const { definition, config } = request.value
  const controller = new AbortController()
  onCancel(() => controller.abort())
  schemaError.value = undefined
  try {
    const result = await definition.createProviderConfig({ t, config, abortSignal: controller.signal })
    return result instanceof z.ZodObject ? result.shape : undefined
  }
  catch (error) {
    if (!controller.signal.aborted)
      schemaError.value = errorMessageFrom(error) ?? t('settings.pages.providers.catalog.edit.config.load-error')
    return undefined
  }
})

const protocolField = computed(() => schema.value?.api)
const searchField = computed(() => schema.value?.webSearch)
const protocolOptions = computed(() => {
  const options: { label: string, value: string }[] = []
  const metadata = protocolField.value?.meta()
  if (Array.isArray(metadata?.options)) {
    for (const option of metadata.options as unknown[]) {
      if (option && typeof option === 'object' && 'label' in option && 'value' in option && typeof option.label === 'string' && typeof option.value === 'string')
        options.push({ label: option.label, value: option.value })
    }
  }
  return options
})
const protocol = computed(() => {
  const parsed = protocolField.value?.safeParse(store.getProviderConfig(props.providerId)?.api)
  return parsed?.success && typeof parsed.data === 'string' ? parsed.data : ''
})
const webSearch = computed(() => {
  const parsed = searchField.value?.safeParse(store.getProviderConfig(props.providerId)?.webSearch)
  return parsed?.success === true && parsed.data === true
})

function setField(...[key, value]: ['api', string | undefined] | ['webSearch', boolean]) {
  // Clearing the combobox does not select a protocol. Keep the current choice.
  if (value === undefined)
    return
  // Config references belong to the persisted provider snapshot. Defaults are
  // presentation-only until the user changes a field, including explicit false.
  const config = store.getProviderConfig(props.providerId)
  // The settings page initializes this instance. Ignore a late UI event if the
  // provider was removed by another window, rather than recreating it.
  if (config)
    config[key] = value
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
