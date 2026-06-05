<script setup lang="ts">
import type { VoicePack, VoicePackParams, VoicePackPayload } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { adminApi } from '../modules/api'

const DEFAULT_PARAMS = '{}'

const packs = shallowRef<VoicePack[]>([])
const selected = shallowRef<VoicePack | null>(null)
const loading = shallowRef(false)
const saving = shallowRef(false)

const form = reactive({
  name: '',
  description: '',
  provider: 'volcengine',
  model: 'seed-tts-2.0',
  voiceId: '',
  ttsModelId: '',
  paramsJson: DEFAULT_PARAMS,
  costMultiplier: 1,
  enabled: true,
})

const enabledCount = computed(() => packs.value.filter(pack => pack.enabled).length)
const disabledCount = computed(() => packs.value.length - enabledCount.value)
const selectedId = computed(() => selected.value?.id ?? null)
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

onMounted(() => {
  void loadPacks()
})

async function loadPacks() {
  loading.value = true
  try {
    packs.value = await adminApi.voicePacks()
    if (selectedId.value) {
      selected.value = packs.value.find(pack => pack.id === selectedId.value) ?? null
      if (selected.value)
        fillForm(selected.value)
    }
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load Voice Packs'))
  }
  finally {
    loading.value = false
  }
}

function fillForm(pack: VoicePack) {
  selected.value = pack
  form.name = pack.name
  form.description = pack.description ?? ''
  form.provider = pack.provider
  form.model = pack.model
  form.voiceId = pack.voiceId
  form.ttsModelId = pack.ttsModelId
  form.paramsJson = JSON.stringify(pack.params ?? {}, null, 2)
  form.costMultiplier = pack.costMultiplier
  form.enabled = pack.enabled
}

function resetForm() {
  selected.value = null
  form.name = ''
  form.description = ''
  form.provider = 'volcengine'
  form.model = 'seed-tts-2.0'
  form.voiceId = ''
  form.ttsModelId = ''
  form.paramsJson = DEFAULT_PARAMS
  form.costMultiplier = 1
  form.enabled = true
}

function parseParams(): VoicePackParams {
  const parsed = JSON.parse(form.paramsJson || '{}') as unknown
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Params must be a JSON object')

  for (const [key, value] of Object.entries(parsed)) {
    if (!key.trim())
      throw new Error('Params keys must not be empty')
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
    enabled: form.enabled,
  }
}

async function savePack() {
  saving.value = true
  try {
    if (selected.value) {
      const updated = await adminApi.updateVoicePack(selected.value.id, payload())
      toast.success('Voice Pack updated')
      selected.value = updated
    }
    else {
      const created = await adminApi.createVoicePack(payload())
      toast.success('Voice Pack created')
      selected.value = created
    }
    await loadPacks()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to save Voice Pack'))
  }
  finally {
    saving.value = false
  }
}

async function disableSelected() {
  if (!selected.value)
    return
  saving.value = true
  try {
    const disabled = await adminApi.disableVoicePack(selected.value.id)
    toast.success('Voice Pack disabled')
    selected.value = disabled
    await loadPacks()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to disable Voice Pack'))
  }
  finally {
    saving.value = false
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function formatMultiplier(value: number): string {
  return `${Number(value.toFixed(2))}x`
}
</script>

<template>
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
    <section class="panel overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-neutral-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-sm font-semibold">
            Voice Packs
          </h2>
          <p class="mt-1 text-sm text-neutral-500">
            Curated speech presets exposed to users for character-card binding.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <span class="badge badge-green">
            <span class="i-lucide-volume-2" />
            {{ enabledCount }} enabled
          </span>
          <span class="badge" :class="disabledCount > 0 ? 'badge-amber' : 'badge-green'">
            <span class="i-lucide-circle-slash" />
            {{ disabledCount }} disabled
          </span>
        </div>
      </div>

      <div v-if="loading && packs.length === 0" class="empty-state">
        <span class="i-lucide-loader-2 animate-spin text-2xl" />
        Loading Voice Packs
      </div>

      <table v-else-if="packs.length > 0" class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Routing</th>
            <th>Cost</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="pack in packs"
            :key="pack.id"
            class="cursor-pointer transition-colors hover:bg-neutral-50"
            :class="{ 'bg-emerald-50/50': selectedId === pack.id }"
            tabindex="0"
            @click="fillForm(pack)"
            @keydown.enter.prevent="fillForm(pack)"
            @keydown.space.prevent="fillForm(pack)"
          >
            <td>
              <div class="font-medium">
                {{ pack.name }}
              </div>
              <div class="mt-1 max-w-[280px] truncate text-xs text-neutral-500">
                {{ pack.description || pack.voiceId }}
              </div>
            </td>
            <td>
              <div class="text-xs font-mono">
                {{ pack.ttsModelId }}
              </div>
              <div class="mt-1 text-xs text-neutral-500">
                {{ pack.provider }} / {{ pack.model }}
              </div>
            </td>
            <td>{{ formatMultiplier(pack.costMultiplier) }}</td>
            <td>
              <span class="badge" :class="pack.enabled ? 'badge-green' : 'badge-amber'">
                <span :class="pack.enabled ? 'i-lucide-check-circle-2' : 'i-lucide-pause-circle'" />
                {{ pack.enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </td>
            <td>{{ formatDate(pack.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <span class="i-lucide-volume-x text-2xl" />
        No Voice Packs configured
      </div>
    </section>

    <aside class="panel p-5">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold">
            {{ selected ? 'Edit Voice Pack' : 'New Voice Pack' }}
          </h2>
          <p class="mt-1 text-sm text-neutral-500">
            Frozen copies stay on character cards after binding.
          </p>
        </div>
        <button class="btn btn-secondary" type="button" @click="resetForm">
          <span class="i-lucide-plus" />
          New
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="savePack">
        <label class="block">
          <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Name</span>
          <input v-model="form.name" class="field" required type="text">
        </label>

        <label class="block">
          <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Description</span>
          <input v-model="form.description" class="field" type="text">
        </label>

        <div class="grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Provider</span>
            <input v-model="form.provider" class="field" required type="text">
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Model</span>
            <input v-model="form.model" class="field" required type="text">
          </label>
        </div>

        <label class="block">
          <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">TTS model ID</span>
          <input v-model="form.ttsModelId" class="field text-xs font-mono" required type="text">
        </label>

        <label class="block">
          <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Voice ID</span>
          <input v-model="form.voiceId" class="field text-xs font-mono" required type="text">
        </label>

        <div class="grid gap-4 md:grid-cols-[1fr_120px]">
          <label class="block">
            <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Cost multiplier</span>
            <input v-model.number="form.costMultiplier" class="field" min="0" step="0.1" type="number">
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Enabled</span>
            <select v-model="form.enabled" class="field">
              <option :value="true">
                Yes
              </option>
              <option :value="false">
                No
              </option>
            </select>
          </label>
        </div>

        <label class="block">
          <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Params JSON</span>
          <textarea
            v-model="form.paramsJson"
            class="textarea min-h-[180px] text-xs leading-5 font-mono"
            placeholder="{&#10;  &quot;rate&quot;: &quot;+5%&quot;&#10;}"
            spellcheck="false"
          />
        </label>

        <div v-if="paramsError" class="border border-amber-200 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {{ paramsError }}
        </div>
        <div v-else-if="formError" class="border border-amber-200 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {{ formError }}
        </div>

        <div class="flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
          <button
            v-if="selected?.enabled"
            class="btn btn-danger"
            :disabled="saving"
            type="button"
            @click="disableSelected"
          >
            <span class="i-lucide-ban" />
            Disable
          </button>
          <button class="btn btn-primary" :disabled="saving || paramsError != null || formError != null" type="submit">
            <span :class="saving ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-save'" />
            Save
          </button>
        </div>
      </form>
    </aside>
  </div>
</template>
