<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { Callout, FieldInput } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import CustomModelAuthSection from './custom-model-auth-section.vue'
import CustomModelEndpointSection from './custom-model-endpoint-section.vue'
import CustomModelModelsSection from './custom-model-models-section.vue'
import CustomModelValidationSection from './custom-model-validation-section.vue'
import CustomModelWebLimitCallout from './custom-model-web-limit-callout.vue'
import ProviderAdvancedSettings from './provider-advanced-settings.vue'
import ProviderBasicSettings from './provider-basic-settings.vue'
import ProviderSettingsContainer from './provider-settings-container.vue'

import { provideCustomModelEditor, useCustomModelEditor } from '../../../composables/use-custom-model-editor'

const props = defineProps<{
  providerId: string
}>()

const { t } = useI18n()
const providerId = computed(() => props.providerId)
const editor = provideCustomModelEditor(useCustomModelEditor(providerId))
const showElectronHint = isStageTamagotchi()
</script>

<template>
  <ProviderSettingsContainer>
    <CustomModelWebLimitCallout data-testid="custom-model-web-limit" />
    <Callout
      v-if="showElectronHint"
      :label="t('settings.pages.providers.provider.custom-model.title')"
      data-testid="custom-model-electron-hint"
    >
      {{ t('settings.pages.providers.provider.custom-model.platform-limit.electron') }}
    </Callout>

    <ProviderBasicSettings
      :title="t('settings.pages.providers.common.section.basic.title')"
      :description="t('settings.pages.providers.common.section.basic.description')"
    >
      <div :class="['flex', 'flex-col', 'gap-4']">
        <FieldInput
          v-model="editor.draft.name"
          :label="t('settings.pages.providers.provider.custom-model.instance-name.label')"
          :placeholder="t('settings.pages.providers.provider.custom-model.instance-name.placeholder')"
          required
          data-testid="custom-model-instance-name"
        />
        <CustomModelEndpointSection />
        <CustomModelAuthSection />
        <CustomModelModelsSection />
      </div>
    </ProviderBasicSettings>

    <ProviderAdvancedSettings
      :title="t('settings.pages.providers.provider.custom-model.generation.title')"
      :initial-visible="true"
    >
      <CustomModelValidationSection />
    </ProviderAdvancedSettings>
  </ProviderSettingsContainer>
</template>
