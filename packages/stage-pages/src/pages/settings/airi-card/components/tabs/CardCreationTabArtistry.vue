<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { Select } from '@proj-airi/ui/components/form'
import { useI18n } from 'vue-i18n'

defineProps<{
  artistryProviderOptions: { value: string, label: string }[]
  defaultArtistryProviderPlaceholder: string
}>()
const selectedArtistryProvider = defineModel<string>('selectedArtistryProvider', { required: true })
const selectedArtistryModel = defineModel<string>('selectedArtistryModel', { required: true })
const selectedArtistryPromptPrefix = defineModel<string>('selectedArtistryPromptPrefix', { required: true })
const selectedArtistryWidgetInstruction = defineModel<string>('selectedArtistryWidgetInstruction', { required: true })
const selectedArtistryConfigStr = defineModel<string>('selectedArtistryConfigStr', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      Configure how AIRI generates images and visual content.
    </p>

    <div :class="['grid', 'grid-cols-1', 'gap-4', 'ml-auto', 'mr-auto', 'w-90%']">
      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:image />
          Artistry Provider
        </label>
        <Select
          v-model="selectedArtistryProvider"
          :options="artistryProviderOptions"
          :placeholder="defaultArtistryProviderPlaceholder"
          class="w-full"
        />
      </div>

      <div class="mt-4 flex flex-col gap-5">
        <FieldInput
          v-model="selectedArtistryModel"
          label="Artistry Model (Optional Override)"
          description="Model identifier if needed by provider"
          placeholder="e.g. black-forest-labs/flux-schnell"
        />
        <FieldInput
          v-model="selectedArtistryPromptPrefix"
          label="Artistry Prompt Default Prefix"
          description="Pre-pended to every prompt sent to the image generator."
          placeholder="e.g. Masterpiece, high quality, 1girl, anime,"
        />
        <FieldInput
          v-model="selectedArtistryWidgetInstruction"
          :label="t('settings.pages.modules.artistry.widget-instructions.label')"
          :description="t('settings.pages.modules.artistry.widget-instructions.description')"
          :single-line="false"
          :rows="12"
        />
        <FieldInput
          v-model="selectedArtistryConfigStr"
          label="Artistry Provider Options (JSON)"
          :single-line="false"
        />
      </div>
    </div>
  </div>
</template>
