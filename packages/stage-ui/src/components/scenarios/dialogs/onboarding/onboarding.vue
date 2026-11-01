<script setup lang="ts">
import type { ProviderMode } from '../../../../composables/use-analytics'
import type { ProviderMetadata } from '../../../../libs/providers/metadata'
import type {
  OnboardingStep,
  OnboardingStepGuard,
  OnboardingStepLaterHandler,
  OnboardingStepNextHandler,
  OnboardingStepPrevHandler,
  ProviderConfigData,
} from './types'

import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'

import StepModelSelection from './step-model-selection.vue'
import StepPermissions from './step-permissions.vue'
import StepProviderConfiguration from './step-provider-configuration.vue'
import StepProviderSelection from './step-provider-selection.vue'
import StepWelcome from './step-welcome.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { isStepPending, sharedOnboardingSteps, useOnboardingStore } from '../../../../stores/onboarding'
import { useProviderConfigStore } from '../../../../stores/providers/config'
import { useProviderStore } from '../../../../stores/providers/provider'

interface Emits {
  (e: 'configured'): void
}

const props = withDefaults(defineProps<{
  extraSteps?: OnboardingStep[]
}>(), {
  extraSteps: () => [],
})
const emit = defineEmits<Emits>()
const step = ref(0)
const direction = ref<'next' | 'previous'>('next')
const pendingProviderConfig = ref<ProviderConfigData | null>(null)
const { trackOnboardingCompleted, trackOnboardingStarted, trackOnboardingStepCompleted } = useAnalytics()

const providersStore = useProviderStore()
const onboardingStore = useOnboardingStore()

const providerStore = useProviderConfigStore()
const { allChatProvidersMetadata } = storeToRefs(providersStore)
const consciousnessStore = useConsciousnessStore()
const {
  activeProvider,
} = storeToRefs(consciousnessStore)

// Popular providers for first-time setup
const popularProviders = computed(() => {
  const popular = ['openai', 'azure-openai', 'anthropic', 'amazon-bedrock', 'google-generative-ai', 'groq', 'nvidia', 'openrouter-ai', 'ollama', 'deepseek', 'player2', 'openai-compatible']
  return allChatProvidersMetadata.value
    .filter(provider => popular.includes(provider.id))
    .sort((a, b) => popular.indexOf(a.id) - popular.indexOf(b.id))
})

// Selected provider and form data
const selectedProviderId = ref('')

// Computed selected provider
const selectedProvider = computed(() => {
  return allChatProvidersMetadata.value.find(p => p.id === selectedProviderId.value) || null
})

const selectedProviderType = computed<ProviderMode>(() => {
  if (!selectedProviderId.value)
    return 'unknown'
  return selectedProviderId.value.startsWith('official-provider') ? 'official' : 'custom'
})

// Reset validation state when provider changes
function selectProvider(provider: ProviderMetadata) {
  selectedProviderId.value = provider.id
}

const requestPreviousStep: OnboardingStepPrevHandler = () => {
  return navigatePrevious()
}

const requestNextStep: OnboardingStepNextHandler = async (configData?: ProviderConfigData) => {
  pendingProviderConfig.value = configData ?? null
  await navigateNext()
}

async function saveProviderConfiguration(data: ProviderConfigData) {
  if (!selectedProvider.value)
    return

  const config: Record<string, unknown> = {}

  if (data.apiKey)
    config.apiKey = data.apiKey.trim()
  if (data.baseUrl)
    config.baseUrl = data.baseUrl.trim()
  if (data.accountId)
    config.accountId = data.accountId.trim()
  if (data.customFields) {
    for (const [key, value] of Object.entries(data.customFields)) {
      if (value)
        config[key] = value.trim()
    }
  }

  // Provider configuration is leader-owned synchronized state. Route the save
  // through synced actions so the leader persists it and replicates it back;
  // the `configs` computed projection discards direct writes on recompute.
  await providersStore.initializeProvider(selectedProvider.value.id)
  await providerStore.patchProviderConfig(selectedProvider.value.id, config)
  await providersStore.forceProviderConfigured(selectedProvider.value.id)

  activeProvider.value = selectedProvider.value.id

  try {
    await consciousnessStore.loadModelsForProvider(selectedProvider.value.id)
  }
  catch (err) {
    console.error('[onboarding] Failed to load models for provider:', err)
  }
}

/** A shared step takes its version from the store catalog, so the store and the flow agree on it. */
function sharedVersionOf(id: string) {
  return sharedOnboardingSteps.find(step => step.id === id)?.version ?? 1
}

const allSteps = computed<OnboardingStep[]>(() => {
  const coreSteps: OnboardingStep[] = [
    {
      id: 'welcome',
      version: sharedVersionOf('welcome'),
      component: StepWelcome,
      props: () => ({
        customProviderSetupEnabled: !isCustomProvidersDisabled(),
      }),
    },
    {
      id: 'provider-selection',
      version: sharedVersionOf('provider-selection'),
      component: StepProviderSelection,
      props: () => ({
        selectedProviderId: selectedProviderId.value,
        popularProviders: popularProviders.value,
        onSelectProvider: selectProvider,
      }),
    },
    {
      id: 'provider-configuration',
      version: sharedVersionOf('provider-configuration'),
      component: StepProviderConfiguration,
      props: () => ({
        selectedProviderId: selectedProviderId.value,
        selectedProvider: selectedProvider.value,
      }),
      beforeNext: async () => {
        if (!pendingProviderConfig.value)
          return false

        await saveProviderConfiguration(pendingProviderConfig.value)
        pendingProviderConfig.value = null
        return true
      },
    },
    ...props.extraSteps.map(step => ({
      ...step,
      props: () => ({
        ...step.props?.(),
      }),
    })),
    {
      id: 'model-selection',
      version: sharedVersionOf('model-selection'),
      component: StepModelSelection,
    },
    {
      id: 'permissions',
      version: sharedVersionOf('permissions'),
      optional: true,
      component: StepPermissions,
    },
  ]

  return coreSteps
})

// The flow shows the pending shared steps, and the host steps that this device has no record of.
// The list is fixed when the flow starts. A `later` record during the flow does not move the step index.
const sharedStepIds = new Set(sharedOnboardingSteps.map(sharedStep => sharedStep.id))
const pendingSharedStepIds = new Set(onboardingStore.pendingSharedSteps.map(sharedStep => sharedStep.id))
const flowStepIds = new Set(allSteps.value
  .filter(flowStep => sharedStepIds.has(flowStep.id)
    ? pendingSharedStepIds.has(flowStep.id)
    : isStepPending(onboardingStore.stepRecords, { id: flowStep.id, version: flowStep.version ?? 1 }))
  .map(flowStep => flowStep.id))
const flowSteps = computed(() => allSteps.value.filter(flowStep => flowStepIds.has(flowStep.id)))
/** Steps that the user postponed in this flow. The finish keeps their `later` record. */
const postponedStepIds = new Set<string>()

const currentStep = computed(() => flowSteps.value[step.value] ?? null)
const isLastStep = computed(() => step.value === flowSteps.value.length - 1)
const currentStepProps = computed(() => currentStep.value?.props?.() ?? {})

async function handleSave() {
  // Steps are recorded at the finish, not one by one. The provider steps depend on each
  // other, so a flow that closes in the middle starts again from its first pending step.
  await onboardingStore.recordSteps(
    flowSteps.value.filter(flowStep => !postponedStepIds.has(flowStep.id)).map(flowStep => ({ id: flowStep.id, version: flowStep.version ?? 1 })),
    'done',
  )
  trackOnboardingStepCompleted(currentStep.value?.id ?? 'unknown')
  trackOnboardingCompleted({
    selected_provider_type: selectedProviderType.value,
    selected_provider_id: selectedProviderId.value || undefined,
    selected_use_case: 'unknown',
  })
  emit('configured')
}

async function canPassGuard(guard?: OnboardingStepGuard) {
  if (!guard)
    return true

  return await guard()
}

async function navigateNext() {
  if (!currentStep.value)
    return

  if (!(await canPassGuard(currentStep.value.beforeNext)))
    return

  if (!isLastStep.value)
    trackOnboardingStepCompleted(currentStep.value.id)
  await advance()
}

async function advance() {
  if (isLastStep.value) {
    await handleSave()
    return
  }

  direction.value = 'next'
  step.value++
}

async function navigatePrevious() {
  if (!currentStep.value || step.value <= 0)
    return

  if (!(await canPassGuard(currentStep.value.beforePrev)))
    return

  direction.value = 'previous'
  step.value--
}

const requestLater: OnboardingStepLaterHandler = async () => {
  if (!currentStep.value?.optional)
    return

  // The record is saved now, so closing the dialog later keeps the choice.
  await onboardingStore.recordSteps([{ id: currentStep.value.id, version: currentStep.value.version ?? 1 }], 'later')
  postponedStepIds.add(currentStep.value.id)
  await advance()
}

onMounted(() => {
  trackOnboardingStarted({ entry: 'app_start' })
})
</script>

<template>
  <div class="onboarding-step-container" min-h-0 flex flex-1 flex-col>
    <Transition :name="direction === 'next' ? 'slide-next' : 'slide-prev'" mode="out-in">
      <component
        :is="currentStep.component"
        v-if="currentStep"
        :key="currentStep.id"
        class="flex flex-1 flex-col"
        v-bind="currentStepProps"
        :on-next="requestNextStep"
        :on-previous="step > 0 ? requestPreviousStep : undefined"
        :on-later="currentStep.optional ? requestLater : undefined"
      />
    </Transition>
  </div>
</template>

<style scoped>
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  will-change: transform, opacity;
}

.slide-next-enter-active {
  animation: onboarding-slide-next-in 0.2s ease-in-out both;
}

.slide-next-leave-active {
  animation: onboarding-slide-next-out 0.2s ease-in-out both;
}

.slide-prev-enter-active {
  animation: onboarding-slide-prev-in 0.2s ease-in-out both;
}

.slide-prev-leave-active {
  animation: onboarding-slide-prev-out 0.2s ease-in-out both;
}

@keyframes onboarding-slide-next-in {
  from {
    transform: translateX(2rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes onboarding-slide-next-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(-2rem);
    opacity: 0;
  }
}

@keyframes onboarding-slide-prev-in {
  from {
    transform: translateX(-2rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes onboarding-slide-prev-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(2rem);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide-next-enter-active,
  .slide-next-leave-active,
  .slide-prev-enter-active,
  .slide-prev-leave-active {
    animation-duration: 1ms;
  }
}
</style>
