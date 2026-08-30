<script setup lang="ts">
import { Button, DoubleCheckButton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useCustomModelEditorContext } from '../../../composables/use-custom-model-editor'
import { Alert } from '../../misc'

const { t } = useI18n()
const editor = useCustomModelEditorContext()

const configStatus = computed(() => editor.configError ? 'invalid' : 'valid')
const generationStatus = computed(() => {
  if (editor.generationError)
    return 'invalid'
  if (editor.generationIsCurrent)
    return 'valid'
  return 'idle'
})

const persistedLabel = computed(() =>
  t(`settings.pages.providers.provider.custom-model.status.${editor.persistedStatus}`),
)

const isVerified = computed(() => editor.persistedStatus === 'configured')
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <div :class="['grid', 'gap-3', 'grid-cols-1', 'sm:grid-cols-3']">
      <div :class="['flex', 'flex-col', 'gap-1', 'rounded-lg', 'bg-white', 'p-3', 'dark:bg-neutral-900']">
        <div :class="['text-sm']">
          {{ t('settings.pages.providers.provider.custom-model.stages.config') }}
        </div>
        <div
          data-testid="custom-model-config-status"
          :class="[
            'text-xs',
            configStatus === 'valid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          ]"
        >
          <template v-if="editor.configError">
            {{ t(`settings.pages.providers.provider.custom-model.errors.config.${editor.configError.code}`) }}
          </template>
          <template v-else>
            {{ t('settings.pages.providers.catalog.edit.validators.status.valid') }}
          </template>
        </div>
      </div>
      <div :class="['flex', 'flex-col', 'gap-1', 'rounded-lg', 'bg-white', 'p-3', 'dark:bg-neutral-900']">
        <div :class="['text-sm']">
          {{ t('settings.pages.providers.provider.custom-model.stages.discovery') }}
        </div>
        <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ t(`settings.pages.providers.provider.custom-model.discovery.status.${editor.discoveryStatus}`) }}
        </div>
      </div>
      <div :class="['flex', 'flex-col', 'gap-1', 'rounded-lg', 'bg-white', 'p-3', 'dark:bg-neutral-900']">
        <div :class="['text-sm']">
          {{ t('settings.pages.providers.provider.custom-model.stages.generation') }}
        </div>
        <div
          data-testid="custom-model-generation-status"
          :class="[
            'text-xs',
            generationStatus === 'valid' ? 'text-emerald-600 dark:text-emerald-400' : '',
            generationStatus === 'invalid' ? 'text-red-600 dark:text-red-400' : '',
            generationStatus === 'idle' ? 'text-neutral-500 dark:text-neutral-400' : '',
          ]"
        >
          <template v-if="editor.generationError">
            {{ t(`settings.pages.providers.provider.custom-model.errors.connection.${editor.generationError.code}`) }}
          </template>
          <template v-else-if="editor.generationIsCurrent">
            {{ t('settings.pages.providers.provider.custom-model.generation.success') }}
          </template>
          <template v-else>
            {{ t('settings.pages.providers.provider.custom-model.generation.title') }}
          </template>
        </div>
      </div>
    </div>

    <div
      v-if="editor.browserBlocked"
      data-testid="custom-model-browser-blocked"
      :class="['flex', 'flex-col', 'gap-1', 'text-sm', 'text-red-600', 'dark:text-red-400']"
    >
      <div>{{ t('settings.pages.providers.provider.custom-model.errors.connection.browser-request-blocked') }}</div>
      <div>
        {{ editor.browserBlocked.causes.map(cause => t(`settings.pages.providers.provider.custom-model.errors.causes.${cause}`)).join(', ') }}
      </div>
      <ul :class="['list-disc', 'pl-5']">
        <li
          v-for="step in editor.browserBlocked.nextStepKeys"
          :key="step"
        >
          {{ t(`settings.pages.providers.provider.custom-model.errors.next-steps.${step}`) }}
        </li>
      </ul>
    </div>

    <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
      <Button
        size="sm"
        :loading="editor.isTestingGeneration"
        :disabled="editor.isTestingGeneration || !!editor.configError"
        data-testid="custom-model-generation-test"
        @click="editor.runGenerationTest()"
      >
        {{ t('settings.pages.providers.provider.custom-model.generation.action') }}
      </Button>
      <Button
        size="sm"
        color="primary"
        variant="primary"
        :loading="editor.isSaving"
        :disabled="!editor.canSaveVerified || editor.isSaving"
        data-testid="custom-model-save-verified"
        @click="editor.saveVerified()"
      >
        {{ t('settings.pages.providers.provider.custom-model.save.verified') }}
      </Button>
      <DoubleCheckButton
        color="orange"
        size="sm"
        :disabled="!editor.canSaveUnverified || editor.isSaving"
        data-testid="custom-model-save-unverified"
        @confirm="editor.saveUnverified()"
        @cancel="editor.cancelUnverifiedSave()"
      >
        {{ t('settings.pages.providers.provider.custom-model.save.unverified') }}
        <template #confirm>
          {{ t('settings.pages.providers.provider.custom-model.save.unverified-confirm') }}
        </template>
        <template #cancel>
          {{ t('settings.pages.providers.provider.custom-model.save.cancel') }}
        </template>
      </DoubleCheckButton>
    </div>

    <Alert v-if="editor.saveError" type="error">
      <template #title>
        {{ t('settings.pages.providers.provider.custom-model.stages.config') }}
      </template>
      <template #content>
        {{ editor.saveError }}
      </template>
    </Alert>

    <div
      data-testid="custom-model-persisted-status"
      :class="[
        'text-sm',
        isVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300',
      ]"
    >
      {{ persistedLabel }}
      <span v-if="!isVerified">
        {{ t('settings.pages.providers.provider.custom-model.save.unverified-hint') }}
      </span>
    </div>
  </div>
</template>
