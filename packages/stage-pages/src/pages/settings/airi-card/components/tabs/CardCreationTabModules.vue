<script setup lang="ts">
import { Select } from '@proj-airi/ui/components/form'
import { useI18n } from 'vue-i18n'

defineProps<{
  consciousnessProviderOptions: { value: string, label: string }[]
  consciousnessModelOptions: { value: string, label: string }[]
  speechProviderOptions: { value: string, label: string }[]
  speechModelOptions: { value: string, label: string }[]
  speechVoiceOptions: { value: string, label: string }[]
  displayModelOptions: { value: string, label: string }[]
  sceneOptions: { value: string, label: string }[]
  consciousnessProviderPlaceholder: string
  defaultConsciousnessModelPlaceholder: string
  speechProviderPlaceholder: string
  defaultSpeechModelPlaceholder: string
  defaultSpeechVoiceIdPlaceholder: string
  defaultDisplayModelIdPlaceholder: string
  consciousnessProviderActive: boolean
  speechProviderActive: boolean
}>()
const selectedConsciousnessProvider = defineModel<string>('selectedConsciousnessProvider', { required: true })
const selectedConsciousnessModel = defineModel<string>('selectedConsciousnessModel', { required: true })
const selectedSpeechProvider = defineModel<string>('selectedSpeechProvider', { required: true })
const selectedSpeechModel = defineModel<string>('selectedSpeechModel', { required: true })
const selectedSpeechVoiceId = defineModel<string>('selectedSpeechVoiceId', { required: true })
const selectedDisplayModelId = defineModel<string>('selectedDisplayModelId', { required: true })
const selectedPreferredBackgroundId = defineModel<string>('selectedPreferredBackgroundId', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      {{ t('settings.pages.card.creation.modules_info') }}
    </p>

    <div :class="['grid', 'grid-cols-1', 'sm:grid-cols-2', 'gap-4', 'ml-auto', 'mr-auto', 'w-90%']">
      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:brain />
          {{ t('settings.pages.card.chat.provider') }}
        </label>
        <Select
          v-model="selectedConsciousnessProvider"
          :options="consciousnessProviderOptions"
          :placeholder="consciousnessProviderPlaceholder"
          class="w-full"
        />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:ghost />
          {{ t('settings.pages.card.consciousness.model') }}
        </label>
        <Select
          v-model="selectedConsciousnessModel"
          :options="consciousnessModelOptions"
          :placeholder="defaultConsciousnessModelPlaceholder"
          :disabled="!selectedConsciousnessProvider && !consciousnessProviderActive"
          class="w-full"
        />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:radio />
          {{ t('settings.pages.card.speech.provider') }}
        </label>
        <Select
          v-model="selectedSpeechProvider"
          :options="speechProviderOptions"
          :placeholder="speechProviderPlaceholder"
          class="w-full"
        />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:mic />
          {{ t('settings.pages.card.speech.model') }}
        </label>
        <Select
          v-model="selectedSpeechModel"
          :options="speechModelOptions"
          :placeholder="defaultSpeechModelPlaceholder"
          :disabled="!selectedSpeechProvider && !speechProviderActive"
          class="w-full"
        />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:music />
          {{ t('settings.pages.card.speech.voice') }}
        </label>
        <Select
          v-model="selectedSpeechVoiceId"
          :options="speechVoiceOptions"
          :placeholder="defaultSpeechVoiceIdPlaceholder"
          :disabled="!selectedSpeechProvider && !speechProviderActive"
          class="w-full"
        />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2', 'sm:col-span-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-solar:user-circle-bold-duotone />
          Models / Avatar
        </label>
        <Select
          v-model="selectedDisplayModelId"
          :options="displayModelOptions"
          :placeholder="defaultDisplayModelIdPlaceholder"
          class="w-full"
        />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2', 'sm:col-span-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-solar:gallery-bold-duotone />
          {{ t('settings.pages.card.creation.preferred_background') }}
        </label>
        <Select
          v-model="selectedPreferredBackgroundId"
          :options="sceneOptions"
          placeholder="Select background preference"
          class="w-full"
        />
      </div>
    </div>
  </div>
</template>
