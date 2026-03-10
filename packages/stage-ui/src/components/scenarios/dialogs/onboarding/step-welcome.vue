<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../../assets/onboarding.avif'

import { useConfigTransfer } from '../../../../composables/use-config-transfer'
import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!

const { importProviderCredentials, importModuleSettings } = useConfigTransfer()

type ImportCategory = 'provider' | 'settings'
type ConfigFormat = 'yaml' | 'env'

const showImport = ref(false)
const importCategory = ref<ImportCategory>('provider')
const importFormat = ref<ConfigFormat>('yaml')
const importText = ref('')
const importError = ref<string | null>(null)
const importSuccess = ref(false)
const fileInputRef = ref<HTMLInputElement>()

function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  const reader = new FileReader()
  reader.onload = (e) => {
    importText.value = (e.target?.result as string) ?? ''
    if (file.name.endsWith('.env'))
      importFormat.value = 'env'
    else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml'))
      importFormat.value = 'yaml'
  }
  reader.readAsText(file)
}

function doImport() {
  importError.value = null
  const text = importText.value.trim()
  if (!text) {
    importError.value = 'Nothing to import — paste or upload a config file first.'
    return
  }
  try {
    if (importCategory.value === 'provider')
      importProviderCredentials(text, importFormat.value)
    else
      importModuleSettings(text, importFormat.value)

    importSuccess.value = true
    importText.value = ''
    if (fileInputRef.value)
      fileInputRef.value.value = ''
  }
  catch (err) {
    importError.value = (err as Error).message
  }
}
</script>

<template>
  <div h-full flex flex-col>
    <div class="mb-2 text-center md:mb-8" flex flex-1 flex-col justify-center>
      <div
        v-motion
        :initial="{ opacity: 0, scale: 0.5 }"
        :visible="{ opacity: 1, scale: 1 }"
        :duration="500"
        class="mb-1 flex justify-center md:mb-4 lg:pt-16 md:pt-8"
      >
        <img :src="onboardingLogo" max-h="50" aspect-square h-auto w-auto object-cover>
      </div>
      <h2
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :visible="{ opacity: 1, y: 0 }"
        :duration="500"
        class="mb-0 text-3xl text-neutral-800 font-bold md:mb-2 dark:text-neutral-100"
      >
        {{ t('settings.dialogs.onboarding.title') }}
      </h2>
      <p
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :visible="{ opacity: 1, y: 0 }"
        :duration="500"
        :delay="100"
        class="text-sm text-neutral-600 md:text-lg dark:text-neutral-400"
      >
        {{ t('settings.dialogs.onboarding.description') }}
      </p>
    </div>

    <!-- Primary CTA -->
    <Button
      v-if="!importSuccess"
      v-motion
      :initial="{ opacity: 0 }"
      :visible="{ opacity: 1 }"
      :duration="500"
      :delay="200"
      :label="t('settings.dialogs.onboarding.start')"
      @click="context.handleNextStep"
    />

    <!-- Import-from-backup link -->
    <button
      v-if="!showImport && !importSuccess"
      v-motion
      :initial="{ opacity: 0 }"
      :visible="{ opacity: 1 }"
      :duration="500"
      :delay="300"
      :class="[
        'mt-3 w-full text-center text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300',
        'transition-colors cursor-pointer select-none',
      ]"
      @click="showImport = true"
    >
      {{ t('settings.dialogs.onboarding.import-hint', 'Already have a config file? Import') }}
    </button>

    <!-- Inline import panel -->
    <div
      v-if="showImport && !importSuccess"
      v-motion
      :initial="{ opacity: 0, y: 8 }"
      :visible="{ opacity: 1, y: 0 }"
      :duration="300"
      :class="['mt-3 flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700']"
    >
      <!-- Category + format selectors -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Category tabs -->
        <div :class="['flex flex-1 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700']">
          <button
            v-for="cat in ([{ id: 'provider', label: 'Credentials' }, { id: 'settings', label: 'Settings' }] as const)"
            :key="cat.id"
            :class="[
              'flex-1 px-3 py-1.5 text-xs font-medium transition-colors',
              importCategory === cat.id
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
            ]"
            @click="importCategory = cat.id"
          >
            {{ cat.label }}
          </button>
        </div>
        <!-- Format tabs -->
        <div :class="['flex rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700']">
          <button
            v-for="fmt in ([{ id: 'yaml', label: 'YAML' }, { id: 'env', label: '.env' }] as const)"
            :key="fmt.id"
            :class="[
              'px-3 py-1.5 text-xs font-mono font-semibold transition-colors',
              importFormat === fmt.id
                ? 'bg-violet-600 text-white'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
            ]"
            @click="importFormat = fmt.id"
          >
            {{ fmt.label }}
          </button>
        </div>
        <!-- File upload -->
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
              'flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700',
              'px-2.5 py-1.5 text-xs font-medium',
              'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
              'transition-colors cursor-pointer select-none',
            ]"
          >
            <div class="i-solar:archive-up-bold-duotone" />
            File
          </div>
        </label>
      </div>

      <textarea
        v-model="importText"
        placeholder="Paste your config here or upload a file…"
        spellcheck="false"
        :class="[
          'h-28 w-full resize-none rounded-lg p-2.5',
          'font-mono text-xs leading-relaxed',
          'border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/60',
          'text-neutral-800 placeholder:text-neutral-400 dark:text-neutral-200 dark:placeholder:text-neutral-600',
          'focus:outline-none focus:ring-2 focus:ring-violet-500/30',
        ]"
      />

      <p
        v-if="importError"
        class="text-xs text-red-500 dark:text-red-400"
      >
        {{ importError }}
      </p>

      <div class="flex gap-2">
        <Button
          label="Import"
          icon="i-solar:import-bold-duotone"
          size="sm"
          :disabled="!importText.trim()"
          @click="doImport"
        />
        <Button
          label="Cancel"
          size="sm"
          variant="secondary"
          @click="showImport = false; importError = null; importText = ''"
        />
      </div>
    </div>

    <!-- Success state -->
    <div
      v-if="importSuccess"
      v-motion
      :initial="{ opacity: 0, y: 8 }"
      :visible="{ opacity: 1, y: 0 }"
      :duration="300"
      class="flex flex-col gap-3"
    >
      <div
        :class="[
          'flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50/80 p-4',
          'dark:border-lime-800 dark:bg-lime-900/20',
        ]"
      >
        <div class="i-solar:check-circle-bold-duotone text-lg text-lime-500" />
        <div>
          <p class="text-sm text-lime-800 font-medium dark:text-lime-300">
            Config imported successfully
          </p>
          <p class="text-xs text-lime-600 dark:text-lime-400">
            Your settings are ready. You can continue importing or start now.
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <Button
          label="Start using AIRI"
          icon="i-solar:rocket-bold-duotone"
          @click="context.handleSave()"
        />
        <Button
          label="Import more"
          icon="i-solar:import-bold-duotone"
          variant="secondary"
          @click="importSuccess = false; showImport = true"
        />
      </div>
    </div>
  </div>
</template>
