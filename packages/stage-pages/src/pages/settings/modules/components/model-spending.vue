<script setup lang="ts">
import type { ModelTier, SpendingCurrency } from '@proj-airi/stage-ui/stores/settings'

import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useSettingsModels } from '@proj-airi/stage-ui/stores/settings'
import { Button, FieldCheckbox, FieldCombobox, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsAdvanced from '../../../../components/settings-advanced.vue'

import { positiveNumberModel } from '../../../../libs/number-model'

const { t } = useI18n()
const providersStore = useProviderStore()
const { configuredChatProvidersMetadata, isLoadingModels } = storeToRefs(providersStore)
const modelSettings = useSettingsModels()
const { tiers, spendingLimitEnabled, spendingLimitAmount, spendingLimitCurrency } = storeToRefs(modelSettings)
const spendingLimitAmountModel = positiveNumberModel(spendingLimitAmount)

const tierOptions = computed<Array<{ label: string, value: ModelTier }>>(() => [
  { label: t('settings.pages.modules.consciousness.spending.tiers.options.fast'), value: 'fast' },
  { label: t('settings.pages.modules.consciousness.spending.tiers.options.default'), value: 'default' },
  { label: t('settings.pages.modules.consciousness.spending.tiers.options.strong'), value: 'strong' },
])
const currencyOptions: Array<{ label: string, value: SpendingCurrency }> = [
  { label: 'USD', value: 'USD' },
  { label: 'CNY', value: 'CNY' },
]
const providerOptions = computed(() => configuredChatProvidersMetadata.value.map(metadata => ({ label: metadata.localizedName ?? metadata.name, value: metadata.id })))
const tierProvider = ref('')
const tierModel = ref('')
const tierValue = ref<ModelTier>('default')
const tierModelOptions = computed(() => providersStore.getModelsForProvider(tierProvider.value).map(model => ({ label: model.name || model.id, value: model.id, description: model.description })))
const markedModels = computed(() => Object.entries(tiers.value).map(([key, tier]) => {
  const [providerId, model] = JSON.parse(key) as [string, string]
  return { key, providerId, model, tier }
}))

watch(tierProvider, async (provider) => {
  if (provider && providersStore.supportsModelListing(provider))
    await providersStore.fetchModelsForProvider(provider)
})

function addTier() {
  if (tierProvider.value && tierModel.value.trim())
    modelSettings.setTier(tierProvider.value, tierModel.value.trim(), tierValue.value)
}
</script>

<template>
  <section :class="['rounded-xl', 'bg-neutral-50 dark:bg-[rgba(0,0,0,0.3)]', 'p-4', 'flex flex-col', 'gap-4']">
    <div :class="['flex flex-col', 'gap-1']">
      <h2 :class="['text-lg font-medium']">
        {{ t('settings.pages.modules.consciousness.spending.title') }}
      </h2>
      <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.consciousness.spending.description') }}
      </p>
    </div>
    <FieldCheckbox
      v-model="spendingLimitEnabled"
      :label="t('settings.pages.modules.consciousness.spending.spending_limit_enabled.label')"
      :description="t('settings.pages.modules.consciousness.spending.spending_limit_enabled.description')"
    />
    <template v-if="spendingLimitEnabled">
      <FieldInput
        v-model="spendingLimitAmountModel"
        type="number"
        :label="t('settings.pages.modules.consciousness.spending.spending_limit_amount.label')"
        :description="t('settings.pages.modules.consciousness.spending.spending_limit_amount.description')"
      />
      <FieldSelect
        v-model="spendingLimitCurrency"
        :label="t('settings.pages.modules.consciousness.spending.spending_limit_currency.label')"
        :description="t('settings.pages.modules.consciousness.spending.spending_limit_currency.description')"
        :options="currencyOptions"
      />
    </template>
    <SettingsAdvanced
      :title="t('settings.pages.modules.consciousness.spending.tiers.label')"
      :description="t('settings.pages.modules.consciousness.spending.tiers.description')"
    >
      <ul v-if="markedModels.length" :class="['flex flex-col', 'gap-2']">
        <li v-for="entry in markedModels" :key="entry.key" :class="['flex flex-wrap items-center', 'gap-2', 'text-sm']">
          <span :class="['flex-1', 'min-w-0', 'break-all']">{{ entry.providerId }} / {{ entry.model }}</span>
          <span :class="['text-neutral-500 dark:text-neutral-400']">{{ tierOptions.find(option => option.value === entry.tier)?.label }}</span>
          <Button size="sm" :label="t('settings.pages.modules.consciousness.spending.tiers.remove')" @click="modelSettings.setTier(entry.providerId, entry.model, undefined)" />
        </li>
      </ul>
      <p v-else :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.consciousness.spending.tiers.empty') }}
      </p>
      <FieldSelect
        v-model="tierProvider"
        :label="t('settings.pages.modules.consciousness.spending.tiers.provider')"
        :options="providerOptions"
      />
      <FieldCombobox
        v-if="tierModelOptions.length"
        v-model="tierModel"
        :label="t('settings.pages.modules.consciousness.spending.tiers.model')"
        :options="tierModelOptions"
        :disabled="isLoadingModels[tierProvider]"
      />
      <FieldInput
        v-else
        v-model="tierModel"
        :label="t('settings.pages.modules.consciousness.spending.tiers.model')"
      />
      <FieldSelect
        v-model="tierValue"
        :label="t('settings.pages.modules.consciousness.spending.tiers.tier')"
        :options="tierOptions"
      />
      <div>
        <Button size="sm" :label="t('settings.pages.modules.consciousness.spending.tiers.add')" :disabled="!tierProvider || !tierModel.trim()" @click="addTier" />
      </div>
    </SettingsAdvanced>
  </section>
</template>
