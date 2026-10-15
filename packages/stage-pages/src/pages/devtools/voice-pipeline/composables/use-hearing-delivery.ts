import type { MaybeRefOrGetter } from 'vue'

import { SHERPAW_TRANSCRIPTION_PROVIDER_ID, sherpawModels } from '@proj-airi/provider-inference'
import { describeBiasDelivery } from '@proj-airi/stage-ui/libs/voice/transcription-bias-delivery'
import { resolveActiveTranscriptionModel, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { computed, toValue } from 'vue'

/**
 * Describes what the active Hearing provider does with a list of phrases: it sends them, ignores them, or takes none.
 * `sherpawModel` is the Sherpaw model of each request when Sherpaw is the provider.
 */
export function useHearingDelivery(phrases: MaybeRefOrGetter<readonly string[]>) {
  const hearing = useHearingStore()
  const providers = useProviderStore()
  const providerConfigs = useProviderConfigStore()

  const providerId = computed(() => hearing.activeTranscriptionProvider)
  const sherpawModel = computed(() => {
    if (providerId.value !== SHERPAW_TRANSCRIPTION_PROVIDER_ID)
      return undefined
    // The Hearing model wins over the provider config, as in each request.
    const configured = resolveActiveTranscriptionModel(hearing.activeTranscriptionModel, providerConfigs.getProviderConfig(SHERPAW_TRANSCRIPTION_PROVIDER_ID))
    return Object.values(sherpawModels).find(model => model.id === configured)
  })
  const delivery = computed(() => describeBiasDelivery({
    providerId: providerId.value,
    supportsHotwords: providers.getTranscriptionFeatures(providerId.value).supportsHotwords,
    sherpawModel: sherpawModel.value,
  }, toValue(phrases)))

  return { providerId, sherpawModel, delivery }
}
