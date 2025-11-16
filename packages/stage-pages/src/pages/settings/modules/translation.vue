<script setup lang="ts">
import { Alert, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useTranslationStore } from '@proj-airi/stage-ui/stores/modules/translation'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const translationStore = useTranslationStore()
const providersStore = useProvidersStore()
const { configuredTranslationProvidersMetadata } = storeToRefs(providersStore)
const {
  activeTranslationProvider,
  inputTranslationEnabled,
  outputTranslationEnabled,
  inputSourceLanguage,
  inputTargetLanguage,
  outputSourceLanguage,
  outputTargetLanguage,
  activeProviderLanguages,
  languagesLoading,
  languagesError,
} = storeToRefs(translationStore)

const { t } = useI18n()

const providerOptions = computed(() => configuredTranslationProvidersMetadata.value.map(provider => ({
  id: provider.id,
  title: provider.localizedName || provider.name,
  description: provider.localizedDescription || provider.description,
})))

const hasProvidersConfigured = computed(() => providerOptions.value.length > 0)

const providerLanguageOptions = computed(() => {
  const seen = new Set<string>()
  const options = activeProviderLanguages.value.map((language) => {
    seen.add(language.code)
    return {
      label: language.name,
      value: language.code,
    }
  })

  if (!seen.has('en'))
    options.push({ label: 'English', value: 'en' })

  return [
    { label: t('settings.pages.modules.translation.languages.auto'), value: 'auto' },
    ...options,
  ]
})

const providerLanguagesLoading = computed(() => languagesLoading.value[activeTranslationProvider.value] ?? false)
const providerLanguagesError = computed(() => languagesError.value[activeTranslationProvider.value] ?? null)

onMounted(() => {
  if (activeTranslationProvider.value)
    translationStore.loadLanguagesForProvider(activeTranslationProvider.value)
})
</script>

<template>
  <div flex="~ col gap-6">
    <div class="border border-neutral-200/60 dark:border-neutral-800/80 rounded-2xl p-4 space-y-4">
      <div>
        <h2 class="text-lg md:text-2xl">
          {{ t('settings.pages.modules.translation.sections.provider.title') }}
        </h2>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.modules.translation.sections.provider.description') }}
        </p>
      </div>
      <div max-w-full>
        <fieldset
          v-if="hasProvidersConfigured"
          flex="~ row gap-4"
          :style="{ 'scrollbar-width': 'none' }"
          min-w-0 of-x-scroll scroll-smooth
          role="radiogroup"
        >
          <RadioCardSimple
            v-for="provider in providerOptions"
            :id="provider.id"
            :key="provider.id"
            v-model="activeTranslationProvider"
            name="translation-provider"
            :value="provider.id"
            :title="provider.title"
            :description="provider.description"
          />
          <RouterLink
            to="/settings/providers#translation"
            border="2px dashed"
            class="bg-white border-neutral-200/80 hover:border-primary-400/60 dark:border-neutral-700/60 dark:bg-neutral-900/40"
            flex="~ col items-center justify-center"
            transition="all duration-200 ease-in-out"
            relative min-w-50 w-fit rounded-xl p-4
          >
            <div class="i-solar:add-circle-line-duotone text-2xl text-primary-500" />
            <span class="text-sm text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.modules.translation.sections.provider.add') }}
            </span>
          </RouterLink>
        </fieldset>
        <div v-else>
          <RouterLink
            class="flex items-center gap-3 border-2 border-dashed border-neutral-200/80 rounded-lg p-4 dark:border-neutral-700/60"
            bg="neutral-50 dark:neutral-900/40"
            transition="colors duration-200 ease-in-out"
            to="/settings/providers#translation"
          >
            <div class="i-solar:warning-circle-line-duotone text-2xl text-amber-500" />
            <div class="flex flex-col">
              <span class="font-medium">{{ t('settings.pages.modules.translation.sections.provider.empty.title') }}</span>
              <span class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ t('settings.pages.modules.translation.sections.provider.empty.description') }}
              </span>
            </div>
            <div class="i-solar:arrow-right-line-duotone ml-auto text-xl text-neutral-400" />
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="border border-neutral-200/60 dark:border-neutral-800/80 rounded-2xl p-4">
        <div class="space-y-2">
          <h3 class="font-semibold text-base text-neutral-800 dark:text-neutral-200">
            {{ t('settings.pages.modules.translation.sections.input.title') }}
          </h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.translation.sections.input.description') }}
          </p>
        </div>
        <div class="mt-4 space-y-4">
          <FieldCheckbox
            v-model="inputTranslationEnabled"
            :label="t('settings.pages.modules.translation.sections.input.toggle.label')"
            :description="t('settings.pages.modules.translation.sections.input.toggle.description')"
            :disabled="!activeTranslationProvider"
          />
          <FieldSelect
            v-model="inputSourceLanguage"
            :label="t('settings.pages.modules.translation.sections.input.source')"
            :options="providerLanguageOptions"
            :loading="providerLanguagesLoading"
            :disabled="!activeTranslationProvider"
          />
          <FieldSelect
            v-model="inputTargetLanguage"
            :label="t('settings.pages.modules.translation.sections.input.target')"
            :options="providerLanguageOptions"
            :loading="providerLanguagesLoading"
            :disabled="!activeTranslationProvider"
          />
        </div>
      </section>
      <section class="border border-neutral-200/60 dark:border-neutral-800/80 rounded-2xl p-4">
        <div class="space-y-2">
          <h3 class="font-semibold text-base text-neutral-800 dark:text-neutral-200">
            {{ t('settings.pages.modules.translation.sections.output.title') }}
          </h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.translation.sections.output.description') }}
          </p>
        </div>
        <div class="mt-4 space-y-4">
          <FieldCheckbox
            v-model="outputTranslationEnabled"
            :label="t('settings.pages.modules.translation.sections.output.toggle.label')"
            :description="t('settings.pages.modules.translation.sections.output.toggle.description')"
            :disabled="!activeTranslationProvider"
          />
          <FieldSelect
            v-model="outputSourceLanguage"
            :label="t('settings.pages.modules.translation.sections.output.source')"
            :options="providerLanguageOptions"
            :loading="providerLanguagesLoading"
            :disabled="!activeTranslationProvider"
          />
          <FieldSelect
            v-model="outputTargetLanguage"
            :label="t('settings.pages.modules.translation.sections.output.target')"
            :options="providerLanguageOptions"
            :loading="providerLanguagesLoading"
            :disabled="!activeTranslationProvider"
          />
        </div>
      </section>
    </div>

    <Alert v-if="providerLanguagesError" type="warning">
      <template #title>
        {{ t('settings.pages.modules.translation.sections.languages.error.title') }}
      </template>
      <template #content>
        {{ providerLanguagesError }}
      </template>
    </Alert>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
