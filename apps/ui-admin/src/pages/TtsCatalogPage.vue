<script setup lang="ts">
import type { OfficialTtsModel, OfficialTtsVoice } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { toast } from 'vue-sonner'

import { adminApi } from '../modules/api'

const models = shallowRef<OfficialTtsModel[]>([])
const voices = shallowRef<OfficialTtsVoice[]>([])
const selectedModel = ref('')
const loadingModels = shallowRef(false)
const loadingVoices = shallowRef(false)
const syncingModels = shallowRef(false)
const syncingVoices = shallowRef(false)

const enabledModels = computed(() => models.value.filter(model => model.enabled).length)
const enabledVoices = computed(() => voices.value.filter(voice => voice.enabled).length)
const disabledVoices = computed(() => voices.value.length - enabledVoices.value)
const selectedModelRow = computed(() => models.value.find(model => model.routerModelId === selectedModel.value) ?? null)

watch(selectedModel, () => {
  if (selectedModel.value)
    void loadVoices()
})

onMounted(() => {
  void loadModels()
})

async function loadModels() {
  loadingModels.value = true
  try {
    models.value = await adminApi.officialTtsModels()
    if (!selectedModel.value && models.value[0])
      selectedModel.value = models.value[0].routerModelId
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load TTS models'))
  }
  finally {
    loadingModels.value = false
  }
}

async function loadVoices() {
  if (!selectedModel.value)
    return

  loadingVoices.value = true
  try {
    voices.value = await adminApi.officialTtsVoices(selectedModel.value)
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load TTS voices'))
  }
  finally {
    loadingVoices.value = false
  }
}

async function syncModels() {
  syncingModels.value = true
  try {
    await adminApi.syncOfficialTtsModels()
    toast.success('TTS models synced')
    await loadModels()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to sync TTS models'))
  }
  finally {
    syncingModels.value = false
  }
}

async function syncVoices() {
  if (!selectedModel.value)
    return

  syncingVoices.value = true
  try {
    const result = await adminApi.syncOfficialTtsVoices(selectedModel.value)
    toast.success(`${result.syncedCount} voices synced`)
    await loadVoices()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to sync TTS voices'))
  }
  finally {
    syncingVoices.value = false
  }
}

async function updateModel(model: OfficialTtsModel, patch: Partial<Pick<OfficialTtsModel, 'displayName' | 'enabled' | 'displayOrder'>>) {
  try {
    const updated = await adminApi.updateOfficialTtsModel(model.id, patch)
    models.value = models.value.map(item => item.id === updated.id ? updated : item)
    toast.success('TTS model updated')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to update TTS model'))
  }
}

async function updateVoice(voice: OfficialTtsVoice, patch: Partial<Pick<OfficialTtsVoice, 'displayName' | 'enabled' | 'displayOrder' | 'previewAudioUrl'>>) {
  try {
    const updated = await adminApi.updateOfficialTtsVoice(voice.id, patch)
    voices.value = voices.value.map(item => item.id === updated.id ? updated : item)
    toast.success('TTS voice updated')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to update TTS voice'))
  }
}

function formatDate(value: string | null): string {
  if (!value)
    return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function languageSummary(voice: OfficialTtsVoice): string {
  if (!voice.languages.length)
    return 'Not set'
  return voice.languages.map(language => language.title ?? language.code).join(', ')
}
</script>

<template>
  <div :class="['grid', 'gap-4', 'xl:grid-cols-[360px_minmax(0,1fr)]']">
    <section :class="['panel', 'overflow-hidden']">
      <div :class="['flex', 'items-center', 'justify-between', 'gap-3', 'border-b', 'border-neutral-200', 'px-5', 'py-4']">
        <div>
          <h2 :class="['text-sm', 'font-semibold']">
            TTS Models
          </h2>
          <p :class="['mt-1', 'text-sm', 'text-neutral-500']">
            Official speech models visible to clients.
          </p>
        </div>
        <Button :disabled="syncingModels" :icon="syncingModels ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-refresh-cw'" label="Sync" size="sm" variant="secondary" @click="syncModels" />
      </div>

      <div :class="['flex', 'gap-2', 'border-b', 'border-neutral-200', 'px-5', 'py-3']">
        <span :class="['badge', 'badge-green']">
          <span :class="['i-lucide-check-circle-2']" />
          {{ enabledModels }} enabled
        </span>
        <span :class="['badge', 'badge-amber']">
          <span :class="['i-lucide-volume-2']" />
          {{ models.length }} total
        </span>
      </div>

      <div v-if="loadingModels && models.length === 0" :class="['empty-state']">
        <span :class="['i-lucide-loader-2', 'animate-spin', 'text-2xl']" />
        Loading TTS models
      </div>

      <div v-else-if="models.length > 0" :class="['divide-y', 'divide-neutral-200']">
        <button
          v-for="model in models"
          :key="model.id"
          :class="['w-full', 'px-5', 'py-4', 'text-left', 'transition-colors', selectedModel === model.routerModelId ? 'bg-neutral-100' : 'hover:bg-neutral-50']"
          type="button"
          @click="selectedModel = model.routerModelId"
        >
          <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
            <div :class="['min-w-0']">
              <div :class="['truncate', 'text-sm', 'font-medium']">
                {{ model.displayName }}
              </div>
              <div :class="['mt-1', 'truncate', 'font-mono', 'text-xs', 'text-neutral-500']">
                {{ model.routerModelId }}
              </div>
            </div>
            <span :class="['badge', model.enabled ? 'badge-green' : 'badge-amber']">
              {{ model.enabled ? 'Enabled' : 'Disabled' }}
            </span>
          </div>
          <div :class="['mt-3', 'grid', 'grid-cols-[1fr_auto]', 'gap-2']">
            <input :class="['h-8', 'min-w-0', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" :value="model.displayName" @change="event => updateModel(model, { displayName: (event.target as HTMLInputElement).value })">
            <input :class="['h-8', 'w-20', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" min="0" type="number" :value="model.displayOrder" @change="event => updateModel(model, { displayOrder: Number((event.target as HTMLInputElement).value) })">
          </div>
          <label :class="['mt-3', 'flex', 'items-center', 'gap-2', 'text-sm']">
            <input :checked="model.enabled" type="checkbox" @change="event => updateModel(model, { enabled: (event.target as HTMLInputElement).checked })">
            Visible to clients
          </label>
        </button>
      </div>

      <div v-else :class="['empty-state']">
        <span :class="['i-lucide-volume-x', 'text-2xl']" />
        No TTS models synced
        <Button icon="i-lucide-refresh-cw" label="Sync models" size="sm" variant="secondary" @click="syncModels" />
      </div>
    </section>

    <section :class="['panel', 'overflow-hidden']">
      <div :class="['flex', 'flex-col', 'gap-3', 'border-b', 'border-neutral-200', 'px-5', 'py-4', 'md:flex-row', 'md:items-center', 'md:justify-between']">
        <div>
          <h2 :class="['text-sm', 'font-semibold']">
            TTS Voices
          </h2>
          <p :class="['mt-1', 'text-sm', 'text-neutral-500']">
            {{ selectedModelRow ? selectedModelRow.routerModelId : 'Select a model to manage voices.' }}
          </p>
        </div>
        <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
          <select v-model="selectedModel" :class="['h-8', 'max-w-72', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']">
            <option v-for="model in models" :key="model.id" :value="model.routerModelId">
              {{ model.displayName }}
            </option>
          </select>
          <span :class="['badge', 'badge-green']">
            {{ enabledVoices }} enabled
          </span>
          <span :class="['badge', disabledVoices > 0 ? 'badge-amber' : 'badge-green']">
            {{ disabledVoices }} disabled
          </span>
          <Button :disabled="!selectedModel || syncingVoices" :icon="syncingVoices ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-download'" label="Pull voices" size="sm" variant="secondary" @click="syncVoices" />
        </div>
      </div>

      <div v-if="loadingVoices && voices.length === 0" :class="['empty-state']">
        <span :class="['i-lucide-loader-2', 'animate-spin', 'text-2xl']" />
        Loading TTS voices
      </div>

      <table v-else-if="voices.length > 0" :class="['table']">
        <thead>
          <tr>
            <th>Voice</th>
            <th>Languages</th>
            <th>Preview</th>
            <th>Order</th>
            <th>Status</th>
            <th>Synced</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="voice in voices" :key="voice.id">
            <td>
              <input :class="['h-8', 'w-full', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" :value="voice.displayName" @change="event => updateVoice(voice, { displayName: (event.target as HTMLInputElement).value })">
              <div :class="['mt-1', 'font-mono', 'text-xs', 'text-neutral-500']">
                {{ voice.providerVoiceId }}
              </div>
            </td>
            <td :class="['max-w-56', 'text-xs', 'text-neutral-600']">
              {{ languageSummary(voice) }}
            </td>
            <td>
              <input :class="['h-8', 'w-full', 'min-w-48', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" :value="voice.previewAudioUrl ?? ''" placeholder="https://..." @change="event => updateVoice(voice, { previewAudioUrl: (event.target as HTMLInputElement).value || null })">
            </td>
            <td>
              <input :class="['h-8', 'w-20', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" min="0" type="number" :value="voice.displayOrder" @change="event => updateVoice(voice, { displayOrder: Number((event.target as HTMLInputElement).value) })">
            </td>
            <td>
              <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
                <input :checked="voice.enabled" type="checkbox" @change="event => updateVoice(voice, { enabled: (event.target as HTMLInputElement).checked })">
                {{ voice.enabled ? 'Enabled' : 'Disabled' }}
              </label>
            </td>
            <td :class="['text-xs', 'text-neutral-500']">
              {{ formatDate(voice.lastSyncedAt) }}
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else :class="['empty-state']">
        <span :class="['i-lucide-mic-off', 'text-2xl']" />
        No voices synced for this model
        <Button :disabled="!selectedModel" icon="i-lucide-download" label="Pull provider voices" size="sm" variant="secondary" @click="syncVoices" />
      </div>
    </section>
  </div>
</template>
