<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlaygroundOpenAICompatible,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, Callout, FieldInput, FieldRange } from '@proj-airi/ui'
import { Select } from '@proj-airi/ui/components/form'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface ChatterboxCapabilities {
  voices: string[]
  profiles: string[]
  modes: string[]
}

interface ChatterboxEmoticonRule {
  pattern: string
  replacement: string
}

interface ChatterboxPreset {
  id: string
  voice_file: string
  tts_model: string
  exaggeration: number
  mannerism_profile: string
  ui_expressions: string[]
  ui_mannerisms: string[]
}

interface ChatterboxProfileDraft {
  id: string
  hmph: string
  tilde: string[]
  emoticonRules: ChatterboxEmoticonRule[]
}

const allSupportedTags = [
  '[laughter]',
  '[giggle]',
  '[guffaw]',
  '[sigh]',
  '[gasp]',
  '[groan]',
  '[cry]',
  '[mumble]',
  '[whisper]',
  '[meow]',
  '[bark]',
  '[howl]',
  '[sneeze]',
  '[cough]',
  '[clear_throat]',
  '[sniff]',
  '[snore]',
  '[chew]',
  '[sip]',
  '[kiss]',
  '[shhh]',
  '[humming]',
  '[singing]',
  '[music]',
  '[whistle]',
  '[exhale]',
  '[inhale]',
  '[gibberish]',
]

const allMannerismKeys = ['tilde', 'eyes', 'hmph']

const providerId = 'chatterbox'
const defaultModel = 'chatterbox'
const defaultVoiceSettings = {
  speed: 1.0,
}

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

const speed = ref<number>(
  (providers.value[providerId] as any)?.voiceSettings?.speed
  || (providers.value[providerId] as any)?.speed
  || defaultVoiceSettings.speed,
)

const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => providers.value[providerId]?.voice || 'ivy',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].voice = value
  },
})

const baseUrl = computed(() => String(providers.value[providerId]?.baseUrl || 'http://127.0.0.1:8090/v1/'))
const apiKeyConfigured = computed(() => !!baseUrl.value.trim())

const capabilities = ref<ChatterboxCapabilities | null>(null)
const presets = ref<ChatterboxPreset[]>([])
const profileDrafts = ref<ChatterboxProfileDraft[]>([])
const studioLoading = ref(false)
const presetSaving = ref(false)
const profileSaving = ref(false)
const studioError = ref('')
const studioNotice = ref('')
const selectedPresetId = ref('')
const selectedProfileId = ref('')
const draft = ref<ChatterboxPreset>(createDraft())
const profileDraft = ref<ChatterboxProfileDraft>(createProfileDraft())

const voiceOptions = computed(() =>
  speechStore.getVoicesForProvider(providerId).map(voiceInfo => ({
    value: voiceInfo.id,
    label: voiceInfo.name || voiceInfo.id,
  })),
)

const baseVoiceOptions = computed(() =>
  (capabilities.value?.voices || []).map(item => ({
    value: item,
    label: item,
  })),
)

const modeOptions = computed(() =>
  (capabilities.value?.modes || ['full', 'turbo']).map(item => ({
    value: item,
    label: item,
  })),
)

const profileOptions = computed(() =>
  (capabilities.value?.profiles || []).map(item => ({
    value: item,
    label: item,
  })),
)

const profileDraftOptions = computed(() =>
  profileDrafts.value.map(profile => ({
    value: profile.id,
    label: profile.id,
  })),
)

const expressionText = computed({
  get: () => draft.value.ui_expressions.join(', '),
  set: (value: string) => {
    draft.value.ui_expressions = parseList(value)
  },
})

const mannerismText = computed({
  get: () => draft.value.ui_mannerisms.join(', '),
  set: (value: string) => {
    draft.value.ui_mannerisms = parseList(value)
  },
})

const profileTildeText = computed({
  get: () => profileDraft.value.tilde.join(', '),
  set: (value: string) => {
    profileDraft.value.tilde = parseList(value)
  },
})

const profileEmoticonRulesText = computed({
  get: () => profileDraft.value.emoticonRules.map(rule => `${rule.pattern} => ${rule.replacement}`).join('\n'),
  set: (value: string) => {
    profileDraft.value.emoticonRules = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [pattern, ...replacementParts] = line.split('=>')
        return {
          pattern: pattern?.trim() || '',
          replacement: replacementParts.join('=>').trim(),
        }
      })
      .filter(rule => rule.pattern && rule.replacement)
  },
})

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed)
    return ''

  const normalized = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return normalized.endsWith('/v1/') ? normalized : `${normalized}v1/`
}

function toStudioRootUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/v1\/$/, '/')
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function createDraft(seed: Partial<ChatterboxPreset> = {}): ChatterboxPreset {
  return {
    id: seed.id || '',
    voice_file: seed.voice_file || capabilities.value?.voices?.[0] || 'ivy',
    tts_model: seed.tts_model || capabilities.value?.modes?.[0] || 'full',
    exaggeration: seed.exaggeration ?? 0,
    mannerism_profile: seed.mannerism_profile || capabilities.value?.profiles?.[0] || '',
    ui_expressions: [...(seed.ui_expressions || [])],
    ui_mannerisms: [...(seed.ui_mannerisms || [])],
  }
}

function applyDraft(seed?: Partial<ChatterboxPreset>) {
  draft.value = createDraft(seed)
}

function createProfileDraft(seed: Partial<ChatterboxProfileDraft> = {}): ChatterboxProfileDraft {
  return {
    id: seed.id || '',
    hmph: seed.hmph || '[sigh]',
    tilde: [...(seed.tilde || ['nya', 'woof', 'desu'])],
    emoticonRules: [...(seed.emoticonRules || [
      { pattern: '\\b0_0\\b', replacement: '[meow]' },
      { pattern: '\\b[oO]_[oO]\\b', replacement: '[mew]?' },
    ])],
  }
}

function applyProfileDraft(seed?: Partial<ChatterboxProfileDraft>) {
  profileDraft.value = createProfileDraft(seed)
}

function applyAllTags() {
  draft.value.ui_expressions = [...allSupportedTags]
}

function applyAllMannerisms() {
  draft.value.ui_mannerisms = [...allMannerismKeys]
}

function buildStudioHeaders(): Record<string, string> {
  const apiKey = typeof providers.value[providerId]?.apiKey === 'string'
    ? providers.value[providerId]?.apiKey.trim()
    : ''

  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: buildStudioHeaders(),
  })

  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`)

  return await response.json() as T
}

async function sendJson<T>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...buildStudioHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const errorBody = await response.json() as { detail?: string }
      if (errorBody?.detail)
        detail = String(errorBody.detail)
    }
    catch {
    }
    throw new Error(detail)
  }

  return await response.json() as T
}

function presetPayloadFromDraft() {
  return {
    id: draft.value.id.trim(),
    voice_file: draft.value.voice_file.trim(),
    tts_model: draft.value.tts_model.trim(),
    exaggeration: Number(draft.value.exaggeration ?? 0),
    mannerism_profile: draft.value.mannerism_profile.trim(),
    ui_expressions: [...draft.value.ui_expressions],
    ui_mannerisms: [...draft.value.ui_mannerisms],
  }
}

function profilePayloadFromDraft() {
  return {
    id: profileDraft.value.id.trim(),
    hmph: profileDraft.value.hmph.trim(),
    tilde: [...profileDraft.value.tilde],
    emoticons: profileDraft.value.emoticonRules.map(rule => ({
      pattern: rule.pattern.trim(),
      replacement: rule.replacement.trim(),
    })),
  }
}

async function refreshStudioData() {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl.value)
  if (!apiBaseUrl) {
    capabilities.value = null
    presets.value = []
    profileDrafts.value = []
    studioError.value = ''
    studioNotice.value = ''
    applyDraft()
    applyProfileDraft()
    return
  }

  studioLoading.value = true
  studioError.value = ''

  const rootBaseUrl = toStudioRootUrl(apiBaseUrl)
  const [capabilitiesResult, presetsResult, profilesResult] = await Promise.allSettled([
    fetchJson<ChatterboxCapabilities>(`${rootBaseUrl}chatterbox/capabilities`),
    fetchJson<{ presets?: ChatterboxPreset[] }>(`${rootBaseUrl}chatterbox/presets`),
    fetchJson<{ profiles?: Array<{
      id: string
      hmph?: string
      tilde?: string[]
      emoticons?: ChatterboxEmoticonRule[]
    }> }>(`${rootBaseUrl}chatterbox/profiles`),
  ])

  if (capabilitiesResult.status === 'fulfilled') {
    capabilities.value = {
      voices: capabilitiesResult.value.voices || [],
      profiles: capabilitiesResult.value.profiles || [],
      modes: capabilitiesResult.value.modes || [],
    }
  }
  else {
    capabilities.value = null
  }

  if (presetsResult.status === 'fulfilled') {
    presets.value = (presetsResult.value.presets || []).map(preset => createDraft(preset))
  }
  else {
    presets.value = []
  }

  if (profilesResult.status === 'fulfilled') {
    profileDrafts.value = (profilesResult.value.profiles || []).map(profile => createProfileDraft({
      id: profile.id,
      hmph: profile.hmph || '',
      tilde: profile.tilde || [],
      emoticonRules: profile.emoticons || [],
    }))
  }
  else {
    profileDrafts.value = []
  }

  const errors = [
    capabilitiesResult.status === 'rejected' ? `Capabilities: ${capabilitiesResult.reason}` : '',
    presetsResult.status === 'rejected' ? `Presets: ${presetsResult.reason}` : '',
    profilesResult.status === 'rejected' ? `Profiles: ${profilesResult.reason}` : '',
  ].filter(Boolean)
  studioError.value = errors.join(' | ')

  if (selectedPresetId.value) {
    const existing = presets.value.find(preset => preset.id === selectedPresetId.value)
    applyDraft(existing)
  }
  else if (presets.value[0]) {
    selectedPresetId.value = presets.value[0].id
    applyDraft(presets.value[0])
  }
  else {
    applyDraft()
  }

  if (selectedProfileId.value) {
    const existingProfile = profileDrafts.value.find(profile => profile.id === selectedProfileId.value)
    applyProfileDraft(existingProfile)
  }
  else if (profileDrafts.value[0]) {
    selectedProfileId.value = profileDrafts.value[0].id
    applyProfileDraft(profileDrafts.value[0])
  }
  else {
    applyProfileDraft()
  }

  studioLoading.value = false
}

const refreshStudioDataDebounced = useDebounceFn(() => {
  void refreshStudioData()
}, 500)

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceId || String(voice.value),
    {
      ...providerConfig,
      ...defaultVoiceSettings,
      speed: speed.value,
    },
  )
}

function handleCreateDraft() {
  selectedPresetId.value = ''
  applyDraft()
}

function handleCloneDraft() {
  if (!draft.value.id) {
    handleCreateDraft()
    return
  }

  applyDraft({
    ...draft.value,
    id: `${draft.value.id}-copy`,
  })
  selectedPresetId.value = ''
}

function handleCreateProfileDraft() {
  selectedProfileId.value = ''
  applyProfileDraft()
}

async function handleSavePreset() {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl.value)
  if (!apiBaseUrl) {
    studioError.value = 'Configure a Chatterbox base URL before saving presets.'
    return
  }

  const payload = presetPayloadFromDraft()
  if (!payload.id) {
    studioError.value = 'Preset ID is required.'
    return
  }

  presetSaving.value = true
  studioError.value = ''
  studioNotice.value = ''

  try {
    const rootBaseUrl = toStudioRootUrl(apiBaseUrl)
    const existingId = selectedPresetId.value.trim()
    if (existingId) {
      await sendJson(`${rootBaseUrl}chatterbox/presets/${encodeURIComponent(existingId)}`, 'PUT', payload)
    }
    else {
      await sendJson(`${rootBaseUrl}chatterbox/presets`, 'POST', payload)
    }

    selectedPresetId.value = payload.id
    studioNotice.value = `Saved preset "${payload.id}".`
    await refreshStudioData()
  }
  catch (error) {
    studioError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    presetSaving.value = false
  }
}

async function handleDeletePreset() {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl.value)
  const presetId = selectedPresetId.value.trim() || draft.value.id.trim()
  if (!apiBaseUrl || !presetId)
    return

  presetSaving.value = true
  studioError.value = ''
  studioNotice.value = ''

  try {
    const rootBaseUrl = toStudioRootUrl(apiBaseUrl)
    await sendJson(`${rootBaseUrl}chatterbox/presets/${encodeURIComponent(presetId)}`, 'DELETE')
    selectedPresetId.value = ''
    studioNotice.value = `Deleted preset "${presetId}".`
    await refreshStudioData()
  }
  catch (error) {
    studioError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    presetSaving.value = false
  }
}

async function handleSaveProfile() {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl.value)
  if (!apiBaseUrl) {
    studioError.value = 'Configure a Chatterbox base URL before saving profiles.'
    return
  }

  const payload = profilePayloadFromDraft()
  if (!payload.id) {
    studioError.value = 'Profile ID is required.'
    return
  }

  profileSaving.value = true
  studioError.value = ''
  studioNotice.value = ''

  try {
    const rootBaseUrl = toStudioRootUrl(apiBaseUrl)
    const existingId = selectedProfileId.value.trim()
    if (existingId) {
      await sendJson(`${rootBaseUrl}chatterbox/profiles/${encodeURIComponent(existingId)}`, 'PUT', payload)
    }
    else {
      await sendJson(`${rootBaseUrl}chatterbox/profiles`, 'POST', payload)
    }

    selectedProfileId.value = payload.id
    studioNotice.value = `Saved profile "${payload.id}".`
    await refreshStudioData()
  }
  catch (error) {
    studioError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    profileSaving.value = false
  }
}

async function handleDeleteProfile() {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl.value)
  const profileId = selectedProfileId.value.trim() || profileDraft.value.id.trim()
  if (!apiBaseUrl || !profileId)
    return

  profileSaving.value = true
  studioError.value = ''
  studioNotice.value = ''

  try {
    const rootBaseUrl = toStudioRootUrl(apiBaseUrl)
    await sendJson(`${rootBaseUrl}chatterbox/profiles/${encodeURIComponent(profileId)}`, 'DELETE')
    if (draft.value.mannerism_profile === profileId)
      draft.value.mannerism_profile = ''
    selectedProfileId.value = ''
    studioNotice.value = `Deleted profile "${profileId}".`
    await refreshStudioData()
  }
  catch (error) {
    studioError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    profileSaving.value = false
  }
}

watch(
  () => providers.value[providerId],
  (newConfig) => {
    if (newConfig) {
      const config = newConfig as any
      const newSpeed = config.voiceSettings?.speed || config.speed || defaultVoiceSettings.speed
      if (Math.abs(speed.value - newSpeed) > 0.001)
        speed.value = newSpeed

      if (!config.model && model.value !== defaultModel)
        model.value = defaultModel

      if (!config.voice && voice.value !== 'ivy')
        voice.value = 'ivy'
    }
    else {
      speed.value = defaultVoiceSettings.speed
      model.value = defaultModel
      voice.value = 'ivy'
    }
  },
  { deep: true, immediate: true },
)

watch(speed, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].speed = speed.value
})

watch(model, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].model = model.value
})

watch(voice, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].voice = voice.value
})

watch([() => providers.value[providerId]?.baseUrl, () => providers.value[providerId]?.apiKey], async () => {
  refreshStudioDataDebounced()
  await speechStore.loadVoicesForProvider(providerId)
})

watch(selectedPresetId, (value) => {
  const selectedPreset = presets.value.find(preset => preset.id === value)
  if (selectedPreset)
    applyDraft(selectedPreset)
})

watch(selectedProfileId, (value) => {
  const selectedProfile = profileDrafts.value.find(profile => profile.id === value)
  if (selectedProfile)
    applyProfileDraft(selectedProfile)
})

onMounted(async () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}

  if (!providers.value[providerId].model)
    providers.value[providerId].model = defaultModel
  if (!providers.value[providerId].voice)
    providers.value[providerId].voice = 'ivy'
  if (!providers.value[providerId].baseUrl)
    providers.value[providerId].baseUrl = 'http://127.0.0.1:8090/v1/'

  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
  await refreshStudioData()
})

const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(providerId)
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
    placeholder="Optional"
  >
    <template #basic-settings>
      <Callout label="Chatterbox Management Studio">
        Build reusable voice presets and text-style profiles for Chatterbox in one place. Presets choose the base voice and synthesis mode, while profiles define how text gets rewritten into character-specific sounds and habits.
      </Callout>
    </template>

    <template #voice-settings>
      <FieldInput
        v-model="model"
        label="Model"
        description="Chatterbox model id used for speech synthesis."
        placeholder="chatterbox"
      />
      <Select
        :model-value="String(voice)"
        :options="voiceOptions"
        placeholder="Choose a default voice..."
        @update:model-value="value => voice = String(value)"
      />
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0"
        :step="0.01"
      />
    </template>

    <template #playground>
      <div class="flex flex-col gap-4">
        <div class="grid gap-4 xl:grid-cols-[18rem,minmax(0,1fr)]">
          <div class="flex flex-col gap-4">
            <div class="border border-neutral-200 rounded-2xl bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div class="mb-3 flex items-center justify-between">
                <div>
                  <div class="text-sm font-semibold tracking-wide uppercase opacity-60">
                    System Capabilities
                  </div>
                  <div class="text-lg font-bold">
                    Chatterbox Runtime
                  </div>
                </div>
                <Button variant="secondary" @click="refreshStudioData">
                  Refresh
                </Button>
              </div>

              <div v-if="studioLoading" class="text-sm opacity-70">
                Loading capabilities and presets...
              </div>

              <div v-else class="space-y-4">
                <div>
                  <div class="mb-1 text-xs font-semibold uppercase opacity-60">
                    Base Voices
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-for="item in capabilities?.voices || []"
                      :key="item"
                      class="rounded-full bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800"
                    >
                      {{ item }}
                    </span>
                  </div>
                </div>

                <div>
                  <div class="mb-1 text-xs font-semibold uppercase opacity-60">
                    Profiles
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-for="item in capabilities?.profiles || []"
                      :key="item"
                      class="rounded-full bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800"
                    >
                      {{ item }}
                    </span>
                  </div>
                </div>

                <div>
                  <div class="mb-1 text-xs font-semibold uppercase opacity-60">
                    Modes
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-for="item in capabilities?.modes || []"
                      :key="item"
                      class="rounded-full bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800"
                    >
                      {{ item }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="border border-neutral-200 rounded-2xl bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div class="mb-3 flex items-center justify-between">
                <div>
                  <div class="text-sm font-semibold tracking-wide uppercase opacity-60">
                    Presets
                  </div>
                  <div class="text-lg font-bold">
                    Library
                  </div>
                </div>
              </div>

              <div class="mb-3 flex gap-2">
                <Button variant="secondary" @click="handleCreateDraft">
                  New Draft
                </Button>
                <Button variant="secondary" @click="handleCloneDraft">
                  Clone
                </Button>
              </div>

              <div class="flex flex-col gap-2">
                <button
                  v-for="preset in presets"
                  :key="preset.id"
                  type="button"
                  class="border rounded-xl px-3 py-2 text-left transition"
                  :class="selectedPresetId === preset.id
                    ? 'border-primary-500 bg-primary-500/8'
                    : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'"
                  @click="selectedPresetId = preset.id"
                >
                  <div class="font-semibold">
                    {{ preset.id }}
                  </div>
                  <div class="text-xs opacity-70">
                    {{ preset.voice_file || 'No base voice' }} / {{ preset.mannerism_profile || 'No profile' }}
                  </div>
                </button>

                <div v-if="!presets.length && !studioLoading" class="text-sm opacity-70">
                  No presets discovered from the server yet.
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-4">
            <div class="border border-neutral-200 rounded-2xl bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div class="mb-4 flex items-center justify-between">
                <div>
                  <div class="text-sm font-semibold tracking-wide uppercase opacity-60">
                    Preset Builder
                  </div>
                  <div class="text-lg font-bold">
                    {{ draft.id || 'Untitled Draft' }}
                  </div>
                </div>
                <div class="text-xs opacity-60">
                  Ready to save
                </div>
              </div>

              <Callout label="How presets work">
                A preset bundles three things together: the base voice file, the speech model settings, and the text style profile that reshapes what the character says before audio is generated.
              </Callout>

              <div class="grid mt-4 gap-4 md:grid-cols-2">
                <FieldInput
                  v-model="draft.id"
                  label="Preset ID"
                  description="Stable id for the virtual voice preset."
                  placeholder="preset_lain"
                />

                <Select
                  v-model="draft.voice_file"
                  :options="baseVoiceOptions"
                  placeholder="Select a base voice..."
                />

                <Select
                  v-model="draft.mannerism_profile"
                  :options="profileDraftOptions.length ? profileDraftOptions : profileOptions"
                  placeholder="Select a mannerism profile..."
                />

                <Select
                  v-model="draft.tts_model"
                  :options="modeOptions"
                  placeholder="Select a TTS mode..."
                />
              </div>

              <div class="mt-4">
                <FieldRange
                  v-model="draft.exaggeration"
                  label="Exaggeration"
                  description="Preset-level exaggeration used when Chatterbox is not running in turbo mode."
                  :min="0"
                  :max="1"
                  :step="0.05"
                />
              </div>

              <div class="grid mt-4 gap-4 md:grid-cols-2">
                <label class="flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold">Voice Tags</span>
                    <Button variant="secondary" @click="applyAllTags">
                      All Tags
                    </Button>
                  </div>
                  <textarea
                    v-model="expressionText"
                    rows="6"
                    class="w-full border border-neutral-200 rounded-xl bg-neutral-50 px-3 py-2 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-950"
                    placeholder="[whisper], [sigh], [gasp]"
                  />
                  <span class="text-xs opacity-70">Use square-bracket sound tags like <code>[whisper]</code> or <code>[gasp]</code>. These tags tell Chatterbox how the line should sound when spoken.</span>
                </label>

                <label class="flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold">Text Transform Triggers</span>
                    <Button variant="secondary" @click="applyAllMannerisms">
                      All Mannerisms
                    </Button>
                  </div>
                  <textarea
                    v-model="mannerismText"
                    rows="6"
                    class="w-full border border-neutral-200 rounded-xl bg-neutral-50 px-3 py-2 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-950"
                    placeholder="~, 0_0"
                  />
                  <span class="text-xs opacity-70">These are the trigger families a profile can react to. For example, a profile might replace <code>~</code>, emoticons, or hmph-like interjections with a character-specific sound or phrase.</span>
                </label>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <Button :disabled="presetSaving" @click="handleSavePreset">
                  Save Preset
                </Button>
                <Button
                  variant="secondary"
                  :disabled="presetSaving || (!selectedPresetId && !draft.id)"
                  @click="handleDeletePreset"
                >
                  Delete Preset
                </Button>
                <div class="flex items-center text-xs opacity-60">
                  Save writes directly to the Chatterbox preset library used by the runtime.
                </div>
              </div>
            </div>

            <div class="border border-neutral-200 rounded-2xl bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div class="mb-4 flex items-center justify-between">
                <div>
                  <div class="text-sm font-semibold tracking-wide uppercase opacity-60">
                    Profile Builder
                  </div>
                  <div class="text-lg font-bold">
                    {{ profileDraft.id || 'Untitled Profile Draft' }}
                  </div>
                </div>
                <div class="text-xs opacity-60">
                  Ready to save
                </div>
              </div>

              <Callout label="How profiles work">
                A profile defines how raw text gets transformed before synthesis. It can rewrite tildes, emoticons, and hmph-style reactions into the little sounds and verbal habits that make a character feel distinct.
              </Callout>

              <div class="grid mt-4 gap-4 md:grid-cols-[minmax(0,1fr),auto]">
                <Select
                  v-model="selectedProfileId"
                  :options="profileDraftOptions"
                  placeholder="Active profile..."
                />
                <Button variant="secondary" @click="handleCreateProfileDraft">
                  New Draft
                </Button>
              </div>

              <div v-if="!profileDraftOptions.length && !studioLoading" class="mt-3 text-sm opacity-70">
                No profiles were discovered from the server yet, but you can still sketch the profile design here.
              </div>

              <div class="grid mt-4 gap-4 md:grid-cols-2">
                <FieldInput
                  v-model="profileDraft.id"
                  label="Profile ID"
                  description="Stable id for the mannerism profile."
                  placeholder="doggirl"
                />
                <FieldInput
                  v-model="profileDraft.hmph"
                  label="Hmph Replacement"
                  description="What hmph-style utterances should collapse into."
                  placeholder="[sigh]"
                />
              </div>

              <div class="grid mt-4 gap-4 md:grid-cols-2">
                <label class="flex flex-col gap-2">
                  <span class="text-sm font-semibold">Tilde Replacements</span>
                  <textarea
                    v-model="profileTildeText"
                    rows="5"
                    class="w-full border border-neutral-200 rounded-xl bg-neutral-50 px-3 py-2 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-950"
                    placeholder="nya, woof, desu"
                  />
                  <span class="text-xs opacity-70">Replacements used when <code>~</code> appears in text.</span>
                </label>

                <label class="flex flex-col gap-2">
                  <span class="text-sm font-semibold">Emoticon Replacements</span>
                  <textarea
                    v-model="profileEmoticonRulesText"
                    rows="5"
                    class="w-full border border-neutral-200 rounded-xl bg-neutral-50 px-3 py-2 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-950"
                    placeholder="\\b0_0\\b => [meow]"
                  />
                  <span class="text-xs opacity-70">Map a text pattern to what Chatterbox should say instead. Write one rule per line using <code>pattern =&gt; replacement</code>.</span>
                </label>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <Button :disabled="profileSaving" @click="handleSaveProfile">
                  Save Profile
                </Button>
                <Button
                  variant="secondary"
                  :disabled="profileSaving || (!selectedProfileId && !profileDraft.id)"
                  @click="handleDeleteProfile"
                >
                  Delete Profile
                </Button>
                <div class="flex items-center text-xs opacity-60">
                  Profiles are reusable text transformation recipes that presets can point to.
                </div>
              </div>
            </div>

            <Alert v-if="studioError" type="error">
              <template #title>
                Studio data could not be fully loaded
              </template>
              <template #content>
                <div class="whitespace-pre-wrap break-all">
                  {{ studioError }}
                </div>
              </template>
            </Alert>

            <Alert v-if="studioNotice" type="success">
              <template #title>
                Studio updated
              </template>
              <template #content>
                {{ studioNotice }}
              </template>
            </Alert>

            <SpeechPlaygroundOpenAICompatible
              v-model:model-value="model"
              v-model:voice="voice as any"
              :generate-speech="handleGenerateSpeech"
              :api-key-configured="apiKeyConfigured"
              default-text="Hello! This is a test of the Chatterbox management studio."
            />
          </div>
        </div>
      </div>
    </template>

    <template #advanced-settings>
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>

      <Alert v-if="isValid && isValidating === 0" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
