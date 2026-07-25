<script setup lang="ts">
import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import {
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  SpeechPlayground,
} from '@proj-airi/stage-ui/components'
import { getDefaultStreamingModel, streamingSynthesize } from '@proj-airi/stage-ui/libs'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Callout, ComboboxSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { isAuthenticated, credits, needsLogin } = storeToRefs(authStore)

const providerId = 'official-provider-speech-streaming'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))
const fluxPurchaseDisabled = isFluxPurchaseDisabled()

const providerConfig = computed(() => providersStore.getProviderConfig(providerId))

// Model picker. The catalog and the default model id both come from the
// server's `/api/v1/audio/models/streaming` response (operator-controlled
// via `UNSPEECH_UPSTREAM.streaming`); no client-side hardcoded defaults so
// adding ICL / other backends doesn't need a UI release.
const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const modelsLoading = computed(() => providersStore.isLoadingModels[providerId] || false)
const serverDefaultModel = ref<string | null>(null)
const model = computed({
  get(): string {
    return (providerConfig.value?.model as string | undefined) ?? serverDefaultModel.value ?? ''
  },
  set(val: string) {
    providerConfig.value.model = val
  },
})
const modelOptions = computed(() => providerModels.value.map(m => ({ label: m.name, value: m.id })))

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])
const voicesLoading = ref(false)

async function loadVoices() {
  voicesLoading.value = true
  try {
    await speechStore.loadVoicesForProvider(providerId, model.value)
  }
  finally {
    voicesLoading.value = false
  }
}

onMounted(async () => {
  await providersStore.fetchModelsForProvider(providerId)
  // `getDefaultStreamingModel()` is populated by the provider's listModels()
  // (just ran via fetchModelsForProvider). If the operator hasn't curated a
  // default server-side, fall back to the first model the server returned
  // so the picker always has something selected.
  serverDefaultModel.value = getDefaultStreamingModel() ?? providerModels.value[0]?.id ?? null
  if (!providerConfig.value.model && serverDefaultModel.value)
    providerConfig.value.model = serverDefaultModel.value
  await loadVoices()
})

// Volcengine TTS 1.0 and 2.0 ship different voice catalogues (mars/moon/ICL
// vs uranus/saturn; see unspeech voices.go). Re-fetch on model change so the
// list switches accordingly.
watch(model, async () => {
  await loadVoices()
})

// Synthesize via the streaming session helper. The page uses the SAME
// transport the runtime pipeline uses (ws → apps/server proxy → unspeech
// bridge → Volcengine v3 bidirectional) so the preview faithfully
// represents what the user hears in actual chat. The session is opened
// per-preview because there's no LLM token stream here — we just send
// one `text` frame containing the static preview prompt.
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean): Promise<ArrayBuffer> {
  const requestedModel = model.value
  if (!requestedModel)
    throw new Error('No streaming TTS model selected and server returned no default')
  // `model` looks like `volcengine/seed-tts-2.0`. The trailing path is
  // forwarded as Volcengine's `api_resource_id` so the upstream knows which
  // model variant to use; matches the wiring in `Stage.vue`. We require the
  // `<backend>/<resource>` shape and refuse anything else — silently picking
  // a fallback resource id hides config drift.
  const slashIndex = requestedModel.indexOf('/')
  if (slashIndex < 0)
    throw new Error(`Streaming model id missing backend prefix: ${requestedModel}`)
  const apiResourceId = requestedModel.slice(slashIndex + 1)
  const result = await streamingSynthesize({
    model: requestedModel,
    voice: voiceId,
    input,
    extraBody: {
      api_resource_id: apiResourceId,
      audio: { sample_rate: 24000, bit_rate: 64000 },
    },
  })
  return result.audio
}

function handleLogin() {
  needsLogin.value = true
}
</script>

<template>
  <ProviderSettingsLayout
    v-if="providerMetadata"
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <div v-if="!isAuthenticated" flex flex-col gap-4>
        <Callout theme="primary">
          <template #label>
            {{ t('settings.pages.providers.provider.official.speech-streaming-title') }}
          </template>
          <div flex flex-col gap-3>
            <p>{{ t('settings.dialogs.onboarding.loginPrompt') }}</p>
            <button
              type="button"
              class="w-fit rounded-lg bg-primary-500 px-4 py-2 text-white transition-colors active:scale-95 hover:bg-primary-600"
              @click="handleLogin"
            >
              {{ t('settings.dialogs.onboarding.loginAction') }}
            </button>
          </div>
        </Callout>
      </div>

      <div v-else flex flex-col gap-6>
        <div class="rounded-xl bg-neutral-100/50 p-6 backdrop-blur-sm dark:bg-neutral-800/50">
          <div flex items-center justify-between>
            <div flex flex-col gap-1>
              <span text="sm neutral-500 dark:neutral-400 font-medium uppercase tracking-wider">
                {{ t('settings.dialogs.onboarding.flux') }}
              </span>
              <span text="3xl font-bold text-primary-600 dark:text-primary-400">
                {{ credits }}
              </span>
            </div>
            <button
              v-if="!fluxPurchaseDisabled"
              type="button"
              class="rounded-full bg-primary-500/10 px-6 py-2 text-sm text-primary-600 font-semibold transition-all dark:bg-primary-400/10 hover:bg-primary-500 dark:text-primary-400 hover:text-white dark:hover:bg-primary-400 dark:hover:text-neutral-900"
              @click="router.push('/settings/flux')"
            >
              {{ t('settings.dialogs.onboarding.buyFlux') }}
            </button>
          </div>
        </div>

        <div class="border border-neutral-200/50 rounded-xl p-4 dark:border-neutral-700/50">
          <div flex items-center gap-3>
            <div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span text="sm neutral-600 dark:neutral-300">
              {{ t('settings.pages.providers.provider.common.status.valid') }}
            </span>
          </div>
        </div>

        <div class="space-y-3">
          <Callout label="Model">
            <p>Pick the streaming TTS model variant. All variants share the same voice catalogue today.</p>
          </Callout>
          <ComboboxSelect
            v-model="model"
            :options="modelOptions"
            :disabled="modelsLoading"
            placeholder="Choose a model..."
          />
        </div>

        <SpeechPlayground
          :available-voices="availableVoices"
          :generate-speech="handleGenerateSpeech"
          :api-key-configured="true"
          :voices-loading="voicesLoading"
          default-text="你好，这是流式语音合成的试听样例。"
        />
      </div>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
  <div v-else class="p-8 text-center text-neutral-500">
    Provider is not available.
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
