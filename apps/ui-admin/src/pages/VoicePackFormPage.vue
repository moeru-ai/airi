<script setup lang="ts">
import type { SpeechVoice, VoicePack, VoicePackParams, VoicePackPayload } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { Button, Callout, FieldInput, FieldSelect, FieldTextArea } from '@proj-airi/ui'
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import DatalistField from '../components/voice-packs/DatalistField.vue'

import { adminApi } from '../modules/api'

const DEFAULT_PARAMS = '{}'
const TEST_TEXT = '你好，欢迎来到 AIRI。'
const supportedParams = new Set(['pitch', 'rate', 'volume'])

const route = useRoute()
const router = useRouter()

const packs = shallowRef<VoicePack[]>([])
const models = shallowRef<{ id: string, name: string }[]>([])
const voices = shallowRef<SpeechVoice[]>([])
const recommendedVoices = shallowRef<Record<string, string>>({})
const loading = shallowRef(false)
const loadingCatalog = shallowRef(false)
const loadingVoices = shallowRef(false)
const saving = shallowRef(false)
const testing = shallowRef(false)
const testAudioUrl = shallowRef<string | null>(null)
const testText = shallowRef(TEST_TEXT)
const previousDerived = shallowRef(deriveModelParts('volcengine/seed-tts-2.0'))

const form = reactive({
  name: '',
  description: '',
  provider: 'volcengine',
  model: 'seed-tts-2.0',
  voiceId: '',
  ttsModelId: 'volcengine/seed-tts-2.0',
  paramsJson: DEFAULT_PARAMS,
  costMultiplier: 1,
  status: 'enabled',
})

const statusOptions = [
  { label: 'Yes', value: 'enabled' },
  { label: 'No', value: 'disabled' },
]

const packId = computed(() => typeof route.params.id === 'string' ? route.params.id : null)
const isEditing = computed(() => route.name === 'voice-pack-edit')
const pageTitle = computed(() => isEditing.value ? 'Edit Voice Pack' : 'New Voice Pack')
const selectedPack = computed(() => packs.value.find(pack => pack.id === packId.value) ?? null)

const modelOptions = computed(() =>
  models.value.map(model => ({
    label: model.name || model.id,
    value: model.id,
    description: model.name && model.name !== model.id ? model.id : undefined,
  })),
)

const providerOptions = computed(() => {
  const values = new Set<string>()
  for (const model of models.value)
    values.add(deriveModelParts(model.id).provider)
  for (const pack of packs.value)
    values.add(pack.provider)
  return [...values].filter(Boolean).sort().map(value => ({ label: value, value }))
})

const baseModelOptions = computed(() => {
  const values = new Set<string>()
  for (const model of models.value)
    values.add(deriveModelParts(model.id).model)
  for (const pack of packs.value)
    values.add(pack.model)
  return [...values].filter(Boolean).sort().map(value => ({ label: value, value }))
})

const voiceOptions = computed(() =>
  voices.value.map(voice => ({
    label: voice.name || voice.id,
    value: voice.id,
    description: voiceOptionDescription(voice),
  })),
)

const paramsError = computed(() => {
  try {
    parseParams()
    return null
  }
  catch (error) {
    return errorMessageFromUnknown(error, 'Invalid params JSON')
  }
})

const formError = computed(() => {
  if (!form.name.trim())
    return 'Name is required'
  if (!form.provider.trim())
    return 'Provider is required'
  if (!form.model.trim())
    return 'Model is required'
  if (!form.ttsModelId.trim())
    return 'TTS model ID is required'
  if (!form.voiceId.trim())
    return 'Voice ID is required'
  if (!Number.isFinite(Number(form.costMultiplier)) || Number(form.costMultiplier) < 0)
    return 'Cost multiplier must be a non-negative number'
  return null
})

onMounted(async () => {
  await Promise.all([loadPacks(), loadCatalog()])
  if (isEditing.value)
    fillSelectedPack()
  else
    previousDerived.value = deriveModelParts(form.ttsModelId)
  await loadVoices(form.ttsModelId, { autoPick: !form.voiceId.trim() })
})

onBeforeUnmount(() => {
  revokeTestAudio()
})

watch(() => route.params.id, async () => {
  if (!isEditing.value) {
    resetForm()
    await loadVoices(form.ttsModelId, { autoPick: true })
    return
  }
  fillSelectedPack()
})

watch(() => form.ttsModelId, (next) => {
  const nextDerived = deriveModelParts(next)
  const oldDerived = previousDerived.value
  if (!form.provider.trim() || form.provider === oldDerived.provider)
    form.provider = nextDerived.provider
  if (!form.model.trim() || form.model === oldDerived.model)
    form.model = nextDerived.model
  previousDerived.value = nextDerived
  void loadVoices(next, { autoPick: true })
})

async function loadPacks() {
  loading.value = true
  try {
    packs.value = await adminApi.voicePacks()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load Voice Packs'))
  }
  finally {
    loading.value = false
  }
}

async function loadCatalog() {
  loadingCatalog.value = true
  try {
    models.value = await adminApi.speechModels()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load speech models'))
  }
  finally {
    loadingCatalog.value = false
  }
}

async function loadVoices(model: string, options: { autoPick: boolean }) {
  if (!model.trim()) {
    voices.value = []
    recommendedVoices.value = {}
    return
  }

  loadingVoices.value = true
  try {
    const result = await adminApi.speechVoices(model.trim())
    voices.value = result.voices
    recommendedVoices.value = result.recommended
    if (options.autoPick && !form.voiceId.trim())
      form.voiceId = firstRecommendedVoiceId(result.recommended) ?? result.voices[0]?.id ?? ''
  }
  catch (error) {
    voices.value = []
    recommendedVoices.value = {}
    toast.error(errorMessageFromUnknown(error, 'Failed to load speech voices'))
  }
  finally {
    loadingVoices.value = false
  }
}

function fillSelectedPack() {
  const pack = selectedPack.value
  if (!pack) {
    toast.error('Voice Pack not found')
    void router.replace('/voice-packs')
    return
  }
  fillForm(pack)
}

function fillForm(pack: VoicePack) {
  form.name = pack.name
  form.description = pack.description ?? ''
  form.provider = pack.provider
  form.model = pack.model
  form.voiceId = pack.voiceId
  form.ttsModelId = pack.ttsModelId
  form.paramsJson = JSON.stringify(pack.params ?? {}, null, 2)
  form.costMultiplier = pack.costMultiplier
  form.status = pack.enabled ? 'enabled' : 'disabled'
  previousDerived.value = deriveModelParts(pack.ttsModelId)
}

function resetForm() {
  form.name = ''
  form.description = ''
  form.provider = 'volcengine'
  form.model = 'seed-tts-2.0'
  form.voiceId = ''
  form.ttsModelId = 'volcengine/seed-tts-2.0'
  form.paramsJson = DEFAULT_PARAMS
  form.costMultiplier = 1
  form.status = 'enabled'
  testText.value = TEST_TEXT
  previousDerived.value = deriveModelParts(form.ttsModelId)
  revokeTestAudio()
}

function parseParams(): VoicePackParams {
  const parsed = JSON.parse(form.paramsJson || '{}') as unknown
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Params must be a JSON object')

  for (const [key, value] of Object.entries(parsed)) {
    if (!key.trim())
      throw new Error('Params keys must not be empty')
    if (!supportedParams.has(key))
      throw new Error(`Unsupported Voice Pack parameter "${key}"`)
    const valid = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null
    if (!valid)
      throw new Error(`Unsupported params value for "${key}"`)
  }

  return parsed as VoicePackParams
}

function payload(): VoicePackPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    provider: form.provider.trim(),
    model: form.model.trim(),
    voiceId: form.voiceId.trim(),
    ttsModelId: form.ttsModelId.trim(),
    params: parseParams(),
    costMultiplier: Number(form.costMultiplier),
    enabled: form.status === 'enabled',
  }
}

async function savePack() {
  saving.value = true
  try {
    let saved: VoicePack
    if (isEditing.value && packId.value) {
      saved = await adminApi.updateVoicePack(packId.value, payload())
      toast.success('Voice Pack updated')
    }
    else {
      saved = await adminApi.createVoicePack(payload())
      toast.success('Voice Pack created')
    }
    await loadPacks()
    await router.replace(`/voice-packs/${encodeURIComponent(saved.id)}/edit`)
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to save Voice Pack'))
  }
  finally {
    saving.value = false
  }
}

async function disablePack() {
  if (!packId.value)
    return
  saving.value = true
  try {
    const disabled = await adminApi.disableVoicePack(packId.value)
    toast.success('Voice Pack disabled')
    await loadPacks()
    fillForm(disabled)
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to disable Voice Pack'))
  }
  finally {
    saving.value = false
  }
}

async function testVoicePack() {
  const text = testText.value.trim()
  if (!text) {
    toast.error('Test text is required')
    return
  }

  testing.value = true
  try {
    const params = parseParams()
    const body = {
      model: form.ttsModelId.trim(),
      input: text,
      voice: form.voiceId.trim(),
      speed: normalizeRateOption(params.rate),
      extra_body: voicePackExtraBody(params),
    }
    const blob = await adminApi.testSpeech(body)
    setTestAudio(blob)
    toast.success('Test audio generated')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to generate test audio'))
  }
  finally {
    testing.value = false
  }
}

function voicePackExtraBody(params: VoicePackParams) {
  const pitch = normalizePercentOption(params.pitch, 'pitch')
  const volume = normalizePercentOption(params.volume, 'volume')
  const voicePack: Record<string, unknown> = {}
  if (pitch != null)
    voicePack.pitch = pitch
  if (volume != null)
    voicePack.volume = volume
  return Object.keys(voicePack).length > 0 ? { voice_pack: voicePack } : undefined
}

function setTestAudio(blob: Blob) {
  revokeTestAudio()
  testAudioUrl.value = URL.createObjectURL(blob)
}

function revokeTestAudio() {
  if (!testAudioUrl.value)
    return
  URL.revokeObjectURL(testAudioUrl.value)
  testAudioUrl.value = null
}

function deriveModelParts(modelId: string): { provider: string, model: string } {
  const trimmed = modelId.trim()
  if (!trimmed)
    return { provider: '', model: '' }
  const [provider, ...rest] = trimmed.split('/')
  return {
    provider: provider || '',
    model: rest.join('/') || trimmed,
  }
}

function voiceOptionDescription(voice: SpeechVoice): string | undefined {
  const parts = [
    typeof voice.labels?.gender === 'string' ? voice.labels.gender : undefined,
    voice.languages?.map(language => language.title || language.code).filter(Boolean).join(', '),
    voice.description,
  ].filter(Boolean)
  return parts.join(' · ') || undefined
}

function firstRecommendedVoiceId(recommended: Record<string, string>): string | undefined {
  return recommended['zh-CN'] ?? recommended['en-US'] ?? Object.values(recommended)[0]
}

function normalizePercentOption(value: string | number | boolean | null | undefined, name: string): number | undefined {
  if (value == null)
    return undefined
  if (typeof value === 'number') {
    if (Number.isFinite(value))
      return value
    throw new Error(`Voice Pack parameter "${name}" must be a finite number.`)
  }
  if (typeof value !== 'string')
    throw new Error(`Voice Pack parameter "${name}" must be a number or percent string.`)

  const trimmed = value.trim()
  const normalized = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed))
    throw new Error(`Voice Pack parameter "${name}" must be a number or percent string.`)
  return parsed
}

function normalizeRateOption(value: string | number | boolean | null | undefined): number | undefined {
  if (value == null)
    return undefined
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value > 0)
      return value
    throw new Error('Voice Pack parameter "rate" must be a positive finite number or percent string.')
  }
  if (typeof value !== 'string')
    throw new Error('Voice Pack parameter "rate" must be a positive finite number or percent string.')

  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percent = normalizePercentOption(trimmed, 'rate')
    const speed = 1 + (percent ?? 0) / 100
    if (speed > 0)
      return speed
    throw new Error('Voice Pack parameter "rate" percent must resolve to a positive speed.')
  }

  const parsed = Number(trimmed)
  if (Number.isFinite(parsed) && parsed > 0)
    return parsed
  throw new Error('Voice Pack parameter "rate" must be a positive finite number or percent string.')
}
</script>

<template>
  <div :class="['mx-auto', 'max-w-5xl', 'space-y-5']">
    <section :class="['panel', 'overflow-hidden']">
      <div :class="['flex', 'flex-col', 'gap-3', 'border-b', 'border-neutral-200', 'px-5', 'py-4', 'md:flex-row', 'md:items-center', 'md:justify-between']">
        <div>
          <div :class="['mb-2', 'flex', 'items-center', 'gap-2', 'text-xs', 'font-medium', 'text-neutral-500']">
            <button :class="['inline-flex', 'items-center', 'gap-1', 'hover:text-neutral-900']" type="button" @click="router.push('/voice-packs')">
              <span :class="['i-lucide-arrow-left', 'h-3.5', 'w-3.5']" />
              Voice Packs
            </button>
          </div>
          <h2 :class="['text-sm', 'font-semibold']">
            {{ pageTitle }}
          </h2>
          <p :class="['mt-1', 'text-sm', 'text-neutral-500']">
            Select from configured speech models and voices, or type custom values when the catalog is incomplete.
          </p>
        </div>
        <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
          <span :class="['badge', form.status === 'enabled' ? 'badge-green' : 'badge-amber']">
            <span :class="[form.status === 'enabled' ? 'i-lucide-check-circle-2' : 'i-lucide-pause-circle']" />
            {{ form.status === 'enabled' ? 'Enabled' : 'Disabled' }}
          </span>
          <Button icon="i-lucide-refresh-cw" label="Refresh Catalog" size="sm" type="button" variant="secondary" :loading="loadingCatalog" @click="loadCatalog" />
        </div>
      </div>

      <form :class="['grid', 'gap-5', 'p-5', 'xl:grid-cols-[minmax(0,1fr)_320px]']" @submit.prevent="savePack">
        <div :class="['space-y-5']">
          <div :class="['grid', 'gap-4', 'md:grid-cols-2']">
            <FieldInput v-model="form.name" label="Name" placeholder="Narrator CN" required />
            <FieldInput v-model="form.description" label="Description" placeholder="Warm Mandarin narrator" />
          </div>

          <div :class="['grid', 'gap-4', 'md:grid-cols-2']">
            <DatalistField
              v-model="form.ttsModelId"
              description="Configured router model ID from /api/v1/audio/models."
              input-class="font-mono text-xs"
              label="TTS model ID"
              list-id="voice-pack-tts-models"
              :options="modelOptions"
              placeholder="volcengine/seed-tts-2.0"
              required
            />
            <DatalistField
              v-model="form.voiceId"
              :description="loadingVoices ? 'Loading voices for the selected model...' : 'Voice catalog from /api/v1/audio/voices.'"
              input-class="font-mono text-xs"
              label="Voice ID"
              list-id="voice-pack-voices"
              :options="voiceOptions"
              placeholder="zh_female_vv_uranus_bigtts"
              required
            />
          </div>

          <div :class="['grid', 'gap-4', 'md:grid-cols-2']">
            <DatalistField
              v-model="form.provider"
              description="Derived from the model ID when possible; editable for custom routing metadata."
              label="Provider"
              list-id="voice-pack-providers"
              :options="providerOptions"
              placeholder="volcengine"
              required
            />
            <DatalistField
              v-model="form.model"
              description="Provider-native model name; derived from the router model ID when possible."
              label="Model"
              list-id="voice-pack-provider-models"
              :options="baseModelOptions"
              placeholder="seed-tts-2.0"
              required
            />
          </div>

          <div :class="['grid', 'gap-4', 'md:grid-cols-[1fr_160px]']">
            <FieldInput v-model="form.costMultiplier" label="Cost multiplier" placeholder="1" type="number" />
            <FieldSelect
              v-model="form.status"
              label="Enabled"
              layout="vertical"
              :options="statusOptions"
              select-class="w-full"
            />
          </div>

          <FieldTextArea
            v-model="form.paramsJson"
            description="Supported keys: rate, pitch, volume. Example: { &quot;rate&quot;: &quot;+8%&quot;, &quot;pitch&quot;: 3 }"
            label="Params JSON"
            placeholder="{&#10;  &quot;rate&quot;: &quot;+8%&quot;&#10;}"
            :required="false"
            :rows="9"
            textarea-class="font-mono text-xs leading-5"
          />

          <Callout v-if="paramsError" label="Invalid params" theme="orange">
            {{ paramsError }}
          </Callout>
          <Callout v-else-if="formError" label="Missing fields" theme="orange">
            {{ formError }}
          </Callout>
        </div>

        <aside :class="['space-y-4']">
          <section :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50', 'p-4']">
            <div :class="['mb-3', 'flex', 'items-center', 'gap-2']">
              <span :class="['i-lucide-waveform', 'text-neutral-500']" />
              <h3 :class="['text-sm', 'font-semibold']">
                Test Audio
              </h3>
            </div>
            <FieldTextArea
              v-model="testText"
              description="Generates audio with the current model, voice, rate, pitch, and volume before saving."
              label="Test text"
              :required="false"
              :rows="4"
            />
            <div :class="['mt-3', 'flex', 'justify-end']">
              <Button
                icon="i-lucide-play"
                label="Test"
                size="sm"
                type="button"
                variant="secondary"
                :disabled="paramsError != null || formError != null"
                :loading="testing"
                @click="testVoicePack"
              />
            </div>
            <audio
              v-if="testAudioUrl"
              :class="['mt-4', 'w-full']"
              :src="testAudioUrl"
              controls
            />
          </section>

          <section :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-4']">
            <h3 :class="['text-sm', 'font-semibold']">
              Catalog Status
            </h3>
            <dl :class="['mt-3', 'space-y-2', 'text-xs', 'text-neutral-600']">
              <div :class="['flex', 'justify-between', 'gap-3']">
                <dt>Models</dt>
                <dd :class="['font-mono']">
                  {{ models.length }}
                </dd>
              </div>
              <div :class="['flex', 'justify-between', 'gap-3']">
                <dt>Voices</dt>
                <dd :class="['font-mono']">
                  {{ voices.length }}
                </dd>
              </div>
              <div :class="['flex', 'justify-between', 'gap-3']">
                <dt>Recommended</dt>
                <dd :class="['truncate', 'font-mono']">
                  {{ firstRecommendedVoiceId(recommendedVoices) || 'none' }}
                </dd>
              </div>
            </dl>
          </section>
        </aside>

        <div :class="['border-t', 'border-neutral-200', 'pt-4', 'xl:col-span-2']">
          <div :class="['flex', 'flex-wrap', 'justify-between', 'gap-2']">
            <Button
              v-if="isEditing && selectedPack?.enabled"
              icon="i-lucide-ban"
              label="Disable"
              size="sm"
              type="button"
              variant="danger"
              :loading="saving"
              @click="disablePack"
            />
            <span v-else />
            <div :class="['flex', 'flex-wrap', 'gap-2']">
              <Button icon="i-lucide-x" label="Cancel" size="sm" type="button" variant="secondary" @click="router.push('/voice-packs')" />
              <Button
                icon="i-lucide-save"
                label="Save"
                size="sm"
                type="submit"
                :disabled="loading || paramsError != null || formError != null"
                :loading="saving"
              />
            </div>
          </div>
        </div>
      </form>
    </section>
  </div>
</template>
