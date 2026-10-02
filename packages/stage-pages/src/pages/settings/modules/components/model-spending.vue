<script setup lang="ts">
import type { SpendingCurrency } from '@proj-airi/stage-ui/stores/settings'

import { useSettingsModels } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { positiveNumberModel } from '../../../../libs/number-model'

const { t } = useI18n()
const modelSettings = useSettingsModels()
const { spendingLimitEnabled, spendingLimitAmount, spendingLimitCurrency } = storeToRefs(modelSettings)
const spendingLimitAmountModel = positiveNumberModel(spendingLimitAmount)

const currencyOptions: Array<{ label: string, value: SpendingCurrency }> = [
  { label: 'USD', value: 'USD' },
  { label: 'CNY', value: 'CNY' },
]
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
  </section>
</template>
