<script setup lang="ts">
import type { TransferFormat } from '@proj-airi/stage-ui/libs/providers/config-transfer'

import { errorMessageFrom } from '@moeru/std'
import { detectTransferFormat, parseProviderConfigs, serializeProviderConfigs } from '@proj-airi/stage-ui/libs/providers/config-transfer'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, Callout, FieldCheckbox, SelectTab, Textarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const exportFormat = ref<TransferFormat>('yaml')
const formatOptions = [
  { value: 'yaml', label: 'YAML' },
  { value: 'json', label: 'JSON' },
  { value: 'env', label: '.env' },
]

const replaceExisting = ref(false)
const pastedContent = ref('')
const fileInput = ref<HTMLInputElement>()
const status = ref<{ type: 'success' | 'error', text: string } | null>(null)

const configuredProviderIds = computed(() =>
  Object.entries(providers.value)
    .filter(([, config]) => config && Object.keys(config).length > 0)
    .map(([id]) => id),
)

function exportedContent(): string {
  const configs = Object.fromEntries(
    configuredProviderIds.value.map(id => [id, providers.value[id]]),
  )
  return serializeProviderConfigs(configs, exportFormat.value)
}

const exportFileNames: Record<TransferFormat, string> = {
  yaml: 'airi-providers.yaml',
  json: 'airi-providers.json',
  env: 'airi-providers.env',
}

function downloadExport() {
  const blob = new Blob([exportedContent()], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exportFileNames[exportFormat.value]
  anchor.click()
  URL.revokeObjectURL(url)
}

async function copyExport() {
  await navigator.clipboard.writeText(exportedContent())
  status.value = { type: 'success', text: 'Export copied to clipboard.' }
}

function applyImport(content: string, fileName?: string) {
  status.value = null

  try {
    const format = detectTransferFormat(fileName, content)
    const parsed = parseProviderConfigs(content, format)

    // Unknown ids would create dead entries no settings page can edit, so
    // they are skipped and reported instead of silently imported.
    const knownIds = Object.keys(parsed).filter(id => providersStore.providerMetadata[id])
    const unknownIds = Object.keys(parsed).filter(id => !providersStore.providerMetadata[id])

    if (knownIds.length === 0) {
      status.value = { type: 'error', text: `No known providers found in the imported content${unknownIds.length > 0 ? ` (unknown ids: ${unknownIds.join(', ')})` : ''}.` }
      return
    }

    const imported = Object.fromEntries(knownIds.map(id => [id, parsed[id]]))

    if (replaceExisting.value) {
      for (const id of Object.keys(providers.value)) {
        if (!imported[id])
          providersStore.unmarkProviderAdded(id)
      }
      providers.value = imported
    }
    else {
      providers.value = { ...providers.value, ...imported }
    }

    for (const id of knownIds)
      providersStore.markProviderAdded(id)

    const skippedNote = unknownIds.length > 0 ? ` Skipped unknown ids: ${unknownIds.join(', ')}.` : ''
    status.value = { type: 'success', text: `Imported ${knownIds.length} provider configuration${knownIds.length === 1 ? '' : 's'} (${format.toUpperCase()}).${skippedNote}` }
  }
  catch (error) {
    status.value = { type: 'error', text: errorMessageFrom(error) ?? 'Import failed.' }
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  applyImport(await file.text(), file.name)
  // Allow re-selecting the same file after a failed import attempt.
  input.value = ''
}

function importPasted() {
  if (!pastedContent.value.trim()) {
    status.value = { type: 'error', text: 'Paste exported content first.' }
    return
  }

  applyImport(pastedContent.value)
}
</script>

<template>
  <div :class="['flex flex-col gap-6', 'pb-8']">
    <Callout theme="orange" label="Secrets inside">
      <p>
        Exports contain your API keys in plain text. Only store them somewhere
        you trust, and never commit them to a repository.
      </p>
    </Callout>

    <section :class="['flex flex-col gap-3']">
      <h2 :class="['text-lg font-semibold']">
        Export
      </h2>
      <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ configuredProviderIds.length }} configured provider{{ configuredProviderIds.length === 1 ? '' : 's' }} will be exported.
      </p>
      <div :class="['flex items-center gap-3', 'flex-wrap']">
        <SelectTab
          v-model="exportFormat"
          :options="formatOptions"
          size="sm"
        />
        <Button
          label="Download"
          :disabled="configuredProviderIds.length === 0"
          @click="downloadExport"
        />
        <Button
          label="Copy to clipboard"
          variant="secondary"
          :disabled="configuredProviderIds.length === 0"
          @click="copyExport"
        />
      </div>
    </section>

    <section :class="['flex flex-col gap-3']">
      <h2 :class="['text-lg font-semibold']">
        Import
      </h2>
      <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        Accepts YAML, JSON, or .env files exported from this page, as well as
        hand-written minimal configs (format is detected automatically).
      </p>
      <FieldCheckbox
        v-model="replaceExisting"
        label="Replace existing configurations"
        description="When enabled, providers not present in the import are cleared instead of kept."
      />
      <div :class="['flex items-center gap-3', 'flex-wrap']">
        <input
          ref="fileInput"
          type="file"
          accept=".json,.yaml,.yml,.env,.txt,text/plain,application/json"
          :class="['hidden']"
          @change="onFileSelected"
        >
        <Button
          label="Import from file..."
          @click="fileInput?.click()"
        />
      </div>
      <Textarea
        v-model="pastedContent"
        placeholder="...or paste exported YAML / JSON / .env content here"
        :class="['font-mono text-sm']"
      />
      <div>
        <Button
          label="Import pasted content"
          variant="secondary"
          :disabled="!pastedContent.trim()"
          @click="importPasted"
        />
      </div>
    </section>

    <div
      v-if="status"
      :class="[
        'rounded-lg px-4 py-3 text-sm',
        status.type === 'success'
          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      ]"
    >
      {{ status.text }}
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Provider Config Transfer
  subtitleKey: tamagotchi.settings.devtools.title
</route>
