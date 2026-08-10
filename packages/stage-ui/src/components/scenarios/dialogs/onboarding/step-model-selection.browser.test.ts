import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import StepModelSelection from './step-model-selection.vue'

import { useProviderStore } from '../../../../stores/providers/provider'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

describe('onboarding model selection', () => {
  it('reports the selected OpenCode Go model to the onboarding owner', async () => {
    // ROOT CAUSE:
    //
    // The model step wrote directly to the consciousness store. The onboarding
    // owner emitted completion without owning or committing that selection.
    // The Electron onboarding renderer could therefore close while the chat
    // authority still had an empty model.
    //
    // The model step now emits the selection to its onboarding owner. The owner
    // commits the provider and model before it emits completion.
    const pinia = createPinia()
    const onNext = vi.fn()
    const selectedModelId = shallowRef('')
    const Host = defineComponent({
      setup() {
        const providersStore = useProviderStore()
        providersStore.providerRuntimeState['opencode-go'] = {
          models: [{
            id: 'opencode-go/kimi-k3',
            name: 'Kimi K3',
            provider: 'opencode-go',
          }],
          modelStatus: 'ready',
          modelError: null,
        }

        return () => h(StepModelSelection, {
          providerId: 'opencode-go',
          selectedModelId: selectedModelId.value,
          onSelectModel: modelId => selectedModelId.value = modelId,
          onNext,
          onPrevious: vi.fn(),
        })
      },
    })

    const screen = render(Host, {
      global: {
        plugins: [pinia, createTestI18n()],
      },
    })

    await screen.getByText('Kimi K3').click()
    await screen.getByText('Save and Continue').click()

    expect(selectedModelId.value).toBe('opencode-go/kimi-k3')
    expect(onNext).toHaveBeenCalledOnce()
  })
})
