<script setup lang="ts">
import type { RouterSliceDraft } from '../../modules/router-config-form'

import { Button, FieldInput, FieldSelect, FieldTextArea } from '@proj-airi/ui'
import { computed } from 'vue'

import {
  DASHSCOPE_REGION_OPTIONS,
  STEPFUN_MODEL_OPTIONS,
} from '../../modules/router-config-form'

defineProps<{
  index: number
}>()

const emit = defineEmits<{
  duplicate: []
  remove: []
}>()

const slice = defineModel<RouterSliceDraft>('slice', { required: true })

const title = computed(() => {
  switch (slice.value.kind) {
    case 'openrouter':
      return 'OpenRouter'
    case 'azure':
      return 'Azure Speech'
    case 'dashscope-cosyvoice':
      return 'DashScope CosyVoice'
    case 'stepfun':
      return 'StepFun TTS'
    case 'unspeech':
      return 'UnSpeech'
    default:
      return 'Router Slice'
  }
})

const providerKeyDescription = computed(() => {
  if (slice.value.kind === 'unspeech')
    return ''

  return slice.value.existingKeyEntryId
    ? `Loaded key entry ${slice.value.existingKeyEntryId}. Leave blank to keep it.`
    : undefined
})

const providerKeyPlaceholder = computed(() => {
  if (slice.value.kind === 'unspeech')
    return ''

  return slice.value.existingKeyEntryId ? 'Leave blank to keep existing key' : 'Paste provider key'
})

const streamingKeyDescription = computed(() => {
  if (slice.value.kind !== 'unspeech' || !slice.value.streamingExistingKeyEntryId)
    return undefined

  return `Loaded key entry ${slice.value.streamingExistingKeyEntryId}. Leave blank to keep it.`
})

const streamingKeyPlaceholder = computed(() => {
  if (slice.value.kind !== 'unspeech' || !slice.value.streamingExistingKeyEntryId)
    return 'Paste streaming provider key'

  return 'Leave blank to keep existing key'
})
</script>

<template>
  <section :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-4']">
    <div :class="['mb-4', 'flex', 'flex-col', 'gap-3', 'md:flex-row', 'md:items-start', 'md:justify-between']">
      <div :class="['min-w-0']">
        <h3 :class="['truncate', 'text-sm', 'font-semibold']">
          {{ index }}. {{ title }}
        </h3>
        <p :class="['mt-1', 'text-xs', 'text-neutral-500']">
          {{ slice.kind }}
        </p>
      </div>
      <div :class="['flex', 'shrink-0', 'flex-wrap', 'gap-2', 'md:justify-end']">
        <Button class="whitespace-nowrap" icon="i-lucide-copy" label="Duplicate" size="sm" type="button" variant="secondary" @click="emit('duplicate')" />
        <Button class="whitespace-nowrap" icon="i-lucide-trash-2" label="Remove" size="sm" type="button" variant="danger" @click="emit('remove')" />
      </div>
    </div>

    <div v-if="slice.kind === 'openrouter'" :class="['grid', 'gap-4', 'md:grid-cols-2']">
      <FieldInput v-model="slice.modelName" input-class="font-mono text-xs" label="Model alias" placeholder="chat-default" required />
      <FieldInput v-model="slice.overrideModel" input-class="font-mono text-xs" label="Upstream model" placeholder="openai/gpt-4o-mini" required />
      <FieldInput v-model="slice.plaintextKey" autocomplete="new-password" :description="providerKeyDescription" input-class="font-mono text-xs" label="Provider key" :placeholder="providerKeyPlaceholder" required type="password" />
      <FieldInput v-model="slice.baseURL" input-class="font-mono text-xs" label="Base URL" placeholder="https://openrouter.ai/api/v1" required />
      <FieldInput v-model="slice.keyEntryId" input-class="font-mono text-xs" label="Key entry ID" placeholder="openrouter-prod-1" />
      <FieldInput v-model="slice.headerTemplate" input-class="font-mono text-xs" label="Header template" placeholder="Bearer {KEY}" />
    </div>

    <div v-else-if="slice.kind === 'azure'" :class="['grid', 'gap-4', 'md:grid-cols-2']">
      <FieldInput v-model="slice.modelName" input-class="font-mono text-xs" label="Model alias" placeholder="microsoft/v1" required />
      <FieldInput v-model="slice.region" input-class="font-mono text-xs" label="Azure region" placeholder="eastasia" required />
      <FieldInput v-model="slice.plaintextKey" autocomplete="new-password" :description="providerKeyDescription" input-class="font-mono text-xs" label="Provider key" :placeholder="providerKeyPlaceholder" required type="password" />
      <FieldInput v-model="slice.defaultVoice" input-class="font-mono text-xs" label="Default voice" placeholder="zh-CN-XiaoxiaoNeural" />
      <FieldInput v-model="slice.keyEntryId" input-class="font-mono text-xs" label="Key entry ID" placeholder="azure-tts-prod-1" />
    </div>

    <div v-else-if="slice.kind === 'dashscope-cosyvoice'" :class="['grid', 'gap-4', 'md:grid-cols-2']">
      <FieldInput v-model="slice.modelName" input-class="font-mono text-xs" label="Model alias" placeholder="alibaba/cosyvoice-v2" required />
      <FieldSelect v-model="slice.region" label="Region" layout="vertical" :options="DASHSCOPE_REGION_OPTIONS" select-class="w-full" />
      <FieldInput v-model="slice.upstreamModel" input-class="font-mono text-xs" label="Upstream model" placeholder="cosyvoice-v2" required />
      <FieldInput v-model="slice.plaintextKey" autocomplete="new-password" :description="providerKeyDescription" input-class="font-mono text-xs" label="Provider key" :placeholder="providerKeyPlaceholder" required type="password" />
      <FieldInput v-model="slice.keyEntryId" input-class="font-mono text-xs" label="Key entry ID" placeholder="dashscope-tts-prod-1" />
    </div>

    <div v-else-if="slice.kind === 'stepfun'" :class="['grid', 'gap-4', 'md:grid-cols-2']">
      <FieldInput v-model="slice.modelName" input-class="font-mono text-xs" label="Model alias" placeholder="stepfun/stepaudio-2.5-tts" required />
      <FieldSelect v-model="slice.upstreamModel" label="Upstream model" layout="vertical" :options="STEPFUN_MODEL_OPTIONS" select-class="w-full" />
      <FieldInput v-model="slice.plaintextKey" autocomplete="new-password" :description="providerKeyDescription" input-class="font-mono text-xs" label="Provider key" :placeholder="providerKeyPlaceholder" required type="password" />
      <FieldInput v-model="slice.defaultVoice" input-class="font-mono text-xs" label="Default voice" placeholder="cixingnansheng" />
      <FieldInput v-model="slice.instruction" input-class="font-mono text-xs" label="Instruction" placeholder="Speak warmly" />
      <FieldInput v-model="slice.keyEntryId" input-class="font-mono text-xs" label="Key entry ID" placeholder="stepfun-tts-prod-1" />
    </div>

    <div v-else :class="['space-y-4']">
      <FieldInput v-model="slice.restBaseURL" input-class="font-mono text-xs" label="REST base URL" placeholder="http://airi-unspeech.railway.internal:5933" required />

      <label :class="['flex', 'items-start', 'gap-3', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50', 'p-3']">
        <input v-model="slice.streamingEnabled" :class="['mt-1']" type="checkbox">
        <span>
          <span :class="['block', 'text-sm', 'font-medium']">Enable streaming upstream</span>
          <span :class="['block', 'text-xs', 'text-neutral-500']">Writes UNSPEECH_UPSTREAM.streaming for WebSocket TTS.</span>
        </span>
      </label>

      <div v-if="slice.streamingEnabled" :class="['grid', 'gap-4', 'md:grid-cols-2']">
        <FieldInput v-model="slice.streamingUpstreamURL" input-class="font-mono text-xs" label="Streaming WebSocket URL" placeholder="ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream" required />
        <FieldInput v-model="slice.streamingPlaintextKey" autocomplete="new-password" :description="streamingKeyDescription" input-class="font-mono text-xs" label="Streaming provider key" :placeholder="streamingKeyPlaceholder" required type="password" />
        <FieldInput v-model="slice.streamingKeyEntryId" input-class="font-mono text-xs" label="Streaming key entry ID" placeholder="volcengine-prod-1" />
        <FieldInput v-model="slice.streamingDefaultModel" input-class="font-mono text-xs" label="Default streaming model" placeholder="volcengine/seed-tts-2.0" />
        <div :class="['md:col-span-2']">
          <FieldTextArea
            v-model="slice.streamingModelsJson"
            label="Streaming models"
            :required="false"
            :rows="6"
            textarea-class="font-mono text-xs leading-5"
          />
        </div>
      </div>
    </div>
  </section>
</template>
