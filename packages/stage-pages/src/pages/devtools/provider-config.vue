<script setup lang="ts">
import { useConfigTransfer } from '@proj-airi/stage-ui/composables'
import { Button, Callout } from '@proj-airi/ui'
import { computed, ref } from 'vue'

type DataCategory = 'provider' | 'settings'
type ConfigFormat = 'yaml' | 'env'

const {
  exportProviderCredentials,
  importProviderCredentials,
  exportModuleSettings,
  importModuleSettings,
} = useConfigTransfer()

const activeCategory = ref<DataCategory>('provider')
const activeFormat = ref<ConfigFormat>('yaml')
const importText = ref('')
const importError = ref<string | null>(null)
const importSuccess = ref(false)
const fileInputRef = ref<HTMLInputElement>()
const copySuccess = ref(false)

const categories: Array<{ id: DataCategory, label: string, icon: string }> = [
  { id: 'provider', label: 'Provider Credentials', icon: 'i-solar:key-bold-duotone' },
  { id: 'settings', label: 'AIRI Settings', icon: 'i-solar:settings-bold-duotone' },
]

const formats: Array<{ id: ConfigFormat, label: string }> = [
  { id: 'yaml', label: 'YAML' },
  { id: 'env', label: '.env' },
]

const exportedText = computed<string>(() => {
  try {
    return activeCategory.value === 'provider'
      ? exportProviderCredentials(activeFormat.value)
      : exportModuleSettings(activeFormat.value)
  }
  catch {
    return '# Error generating export — check the browser console for details.'
  }
})

const downloadFilename = computed(() => {
  const ext = activeFormat.value === 'yaml' ? 'yaml' : 'env'
  const category = activeCategory.value === 'provider' ? 'provider-credentials' : 'airi-settings'
  return `airi-${category}.${ext}`
})

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(exportedText.value)
    copySuccess.value = true
    setTimeout(() => (copySuccess.value = false), 2000)
  }
  catch {
    // fallback: select the textarea
  }
}

function downloadFile() {
  const blob = new Blob([exportedText.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = downloadFilename.value
  anchor.click()
  URL.revokeObjectURL(url)
}

function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  const reader = new FileReader()
  reader.onload = (e) => {
    importText.value = (e.target?.result as string) ?? ''
    // Auto-detect format from file extension
    if (file.name.endsWith('.env'))
      activeFormat.value = 'env'
    else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml'))
      activeFormat.value = 'yaml'
  }
  reader.readAsText(file)
}

function doImport() {
  importError.value = null
  importSuccess.value = false
  const text = importText.value.trim()
  if (!text) {
    importError.value = 'Nothing to import — paste or upload a config file first.'
    return
  }
  try {
    if (activeCategory.value === 'provider')
      importProviderCredentials(text, activeFormat.value)
    else
      importModuleSettings(text, activeFormat.value)

    importSuccess.value = true
    importText.value = ''
    // Reset file input so the same file can be re-uploaded later if needed
    if (fileInputRef.value)
      fileInputRef.value.value = ''
  }
  catch (err) {
    importError.value = (err as Error).message
  }
}

function selectCategory(id: DataCategory) {
  activeCategory.value = id
  importError.value = null
  importSuccess.value = false
}
</script>

<template>
  <div :class="['flex flex-col gap-5 px-4 pb-16 pt-5', 'max-w-3xl mx-auto w-full']">
    <!-- ── Category tabs ────────────────────────────────────────────── -->
    <div :class="['flex rounded-xl overflow-hidden', 'border border-neutral-200 dark:border-neutral-800']">
      <button
        v-for="cat in categories"
        :key="cat.id"
        :class="[
          'flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
          activeCategory === cat.id
            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
            : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200',
        ]"
        @click="selectCategory(cat.id)"
      >
        <div :class="cat.icon" />
        {{ cat.label }}
      </button>
    </div>

    <!-- ── Format toggle ───────────────────────────────────────────── -->
    <div class="flex items-center gap-3">
      <span class="text-sm text-neutral-500 font-medium dark:text-neutral-400">Format</span>
      <div :class="['flex rounded-lg overflow-hidden', 'border border-neutral-200 dark:border-neutral-700']">
        <button
          v-for="fmt in formats"
          :key="fmt.id"
          :class="[
            'px-4 py-1.5 text-xs font-mono font-semibold transition-colors',
            activeFormat === fmt.id
              ? 'bg-violet-600 text-white'
              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
          ]"
          @click="activeFormat = fmt.id"
        >
          {{ fmt.label }}
        </button>
      </div>
    </div>

    <!-- ── Import ─────────────────────────────────────────────────── -->
    <div :class="['flex flex-col gap-3 rounded-xl p-5', 'border border-neutral-200 dark:border-neutral-800']">
      <div class="flex items-center justify-between">
        <h3 class="text-sm text-neutral-800 font-semibold dark:text-neutral-100">
          Import
        </h3>
        <!-- File upload trigger -->
        <label class="cursor-pointer">
          <input
            ref="fileInputRef"
            type="file"
            class="hidden"
            accept=".yaml,.yml,.env,.txt"
            @change="handleFileUpload"
          >
          <div
            :class="[
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
              'border border-neutral-200 dark:border-neutral-700',
              'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
              'transition-colors cursor-pointer select-none',
            ]"
          >
            <div class="i-solar:archive-up-bold-duotone" />
            Upload file
          </div>
        </label>
      </div>

      <textarea
        v-model="importText"
        placeholder="Paste your YAML or .env config here, or upload a file above…"
        spellcheck="false"
        :class="[
          'h-44 w-full resize-y rounded-lg p-3',
          'font-mono text-xs leading-relaxed',
          'border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40',
          'text-neutral-800 placeholder:text-neutral-400 dark:text-neutral-200 dark:placeholder:text-neutral-600',
          'focus:outline-none focus:ring-2 focus:ring-violet-500/30',
        ]"
      />

      <!-- Error / success feedback -->
      <Callout
        v-if="importError"
        label="Import failed"
        theme="orange"
      >
        <p class="text-xs text-neutral-700 dark:text-neutral-200">
          {{ importError }}
        </p>
      </Callout>

      <Callout
        v-if="importSuccess"
        label="Import successful"
        theme="lime"
      >
        <p class="text-xs text-neutral-700 dark:text-neutral-200">
          Settings have been applied and are active immediately.
        </p>
      </Callout>

      <Button
        label="Import"
        icon="i-solar:import-bold-duotone"
        :disabled="!importText.trim()"
        @click="doImport"
      />
    </div>

    <!-- ── Export ─────────────────────────────────────────────────── -->
    <div :class="['flex flex-col gap-3 rounded-xl p-5', 'border border-neutral-200 dark:border-neutral-800']">
      <div class="flex items-center justify-between">
        <h3 class="text-sm text-neutral-800 font-semibold dark:text-neutral-100">
          Export
        </h3>
        <div class="flex gap-2">
          <Button
            :label="copySuccess ? 'Copied!' : 'Copy'"
            :icon="copySuccess ? 'i-solar:check-circle-bold-duotone' : 'i-solar:copy-bold-duotone'"
            size="sm"
            variant="secondary"
            @click="copyToClipboard"
          />
          <Button
            label="Download"
            icon="i-solar:download-bold-duotone"
            size="sm"
            variant="secondary"
            @click="downloadFile"
          />
        </div>
      </div>

      <Callout label="Credentials exported as plaintext" theme="orange">
        <p class="text-xs text-neutral-700 dark:text-neutral-200">
          API keys and secrets appear in plaintext. Do not share this file publicly or commit it to version control.
        </p>
      </Callout>

      <textarea
        :value="exportedText"
        readonly
        spellcheck="false"
        :class="[
          'h-56 w-full resize-y rounded-lg p-3',
          'font-mono text-xs leading-relaxed',
          'border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/60',
          'text-neutral-800 dark:text-neutral-200',
          'focus:outline-none',
        ]"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.devtools.provider-config.title
  subtitleKey: settings.pages.system.developer.title
  stageTransition:
    name: slide
</route>
