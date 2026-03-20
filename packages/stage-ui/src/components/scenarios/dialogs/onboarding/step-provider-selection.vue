<script setup lang="ts">
import type { ProviderMetadata } from '../../../../stores/providers'
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { RadioCardDetail } from '../../../menu'

interface Props {
  availableProviders: ProviderMetadata[]
  selectedProviderId: string
  onSelectProvider: (provider: ProviderMetadata) => void
  onNext: OnboardingStepNextHandler
  onPrevious: OnboardingStepPrevHandler
}

const props = defineProps<Props>()
const { t } = useI18n()

const selectedProviderIdModel = computed({
  get: () => props.selectedProviderId,
  set: (providerId: string) => {
    const provider = props.availableProviders.find(item => item.id === providerId)
    if (provider)
      props.onSelectProvider(provider)
  },
})
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="props.onPrevious">
        <div class="i-solar:alt-arrow-left-line-duotone h-5 w-5" />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.selectProvider') }}
      </h2>
      <div class="h-5 w-5" />
    </div>
    <div class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RadioCardDetail
          v-for="provider in props.availableProviders"
          :id="provider.id"
          :key="provider.id"
          v-model="selectedProviderIdModel"
          name="provider-selection"
          :value="provider.id"
          :title="provider.localizedName || provider.id"
          :description="provider.localizedDescription || ''"
          @click="props.onSelectProvider(provider)"
        />
      </div>
    </div>
    <Button
      :label="t('settings.dialogs.onboarding.next')"
      :disabled="!selectedProviderIdModel"
      @click="props.onNext"
    />
  </div>
</template>
