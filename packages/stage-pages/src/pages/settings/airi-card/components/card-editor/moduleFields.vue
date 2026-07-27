<script setup lang="ts">
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { useI18n } from 'vue-i18n'

interface SelectOption {
  label: string
  value: string
}

defineOptions({ name: 'CardEditorModuleFields' })

const props = defineProps<{
  consciousnessProviderOptions: SelectOption[]
  consciousnessModelOptions: SelectOption[]
  visionProviderOptions: SelectOption[]
  visionModelOptions: SelectOption[]
  speechProviderOptions: SelectOption[]
  speechModelOptions: SelectOption[]
  speechVoiceOptions: SelectOption[]
  displayModelOptions: SelectOption[]
  defaultConsciousnessProvider?: string
  defaultConsciousnessModel?: string
  defaultVisionProvider?: string
  defaultVisionModel?: string
  defaultSpeechProvider?: string
  defaultSpeechModel?: string
  defaultSpeechVoiceId?: string
  defaultDisplayModelId?: string
}>()

const consciousnessProvider = defineModel<string>('consciousnessProvider', { required: true })
const consciousnessModel = defineModel<string>('consciousnessModel', { required: true })
const visionProvider = defineModel<string>('visionProvider', { required: true })
const visionModel = defineModel<string>('visionModel', { required: true })
const speechProvider = defineModel<string>('speechProvider', { required: true })
const speechModel = defineModel<string>('speechModel', { required: true })
const speechVoiceId = defineModel<string>('speechVoiceId', { required: true })
const displayModelId = defineModel<string>('displayModelId', { required: true })

const { t } = useI18n()

function defaultPlaceholder(defaultValue: string | undefined): string {
  return defaultValue
    ? `${t('settings.pages.card.creation.use_default')} (${defaultValue})`
    : t('settings.pages.card.creation.use_default_not_configured')
}
</script>

<template>
  <div :class="['tab-content', 'mx-auto', 'w-95%']">
    <p class="mb-3">
      {{ t('settings.pages.card.creation.modules_info') }}
    </p>

    <div :class="['grid', 'grid-cols-1', 'sm:grid-cols-2', 'gap-4', 'mx-auto', 'w-90%']">
      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:brain />
          {{ t('settings.pages.card.chat.provider') }}
        </label>
        <ComboboxSelect v-model="consciousnessProvider" :options="props.consciousnessProviderOptions" :placeholder="defaultPlaceholder(props.defaultConsciousnessProvider)" class="w-full" />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:ghost />
          {{ t('settings.pages.card.consciousness.model') }}
        </label>
        <ComboboxSelect v-model="consciousnessModel" :options="props.consciousnessModelOptions" :placeholder="defaultPlaceholder(props.defaultConsciousnessModel)" :disabled="!consciousnessProvider && !props.defaultConsciousnessProvider" class="w-full" />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:eye />
          {{ t('settings.pages.card.vision.provider') }}
        </label>
        <ComboboxSelect v-model="visionProvider" :options="props.visionProviderOptions" :placeholder="defaultPlaceholder(props.defaultVisionProvider)" class="w-full" />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:scan-eye />
          {{ t('settings.pages.card.vision.model') }}
        </label>
        <ComboboxSelect v-model="visionModel" :options="props.visionModelOptions" :placeholder="defaultPlaceholder(props.defaultVisionModel)" :disabled="!visionProvider && !props.defaultVisionProvider" class="w-full" />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:radio />
          {{ t('settings.pages.card.speech.provider') }}
        </label>
        <ComboboxSelect v-model="speechProvider" :options="props.speechProviderOptions" :placeholder="defaultPlaceholder(props.defaultSpeechProvider)" class="w-full" />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:mic />
          {{ t('settings.pages.card.speech.model') }}
        </label>
        <ComboboxSelect v-model="speechModel" :options="props.speechModelOptions" :placeholder="defaultPlaceholder(props.defaultSpeechModel)" :disabled="!speechProvider && !props.defaultSpeechProvider" class="w-full" />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:music />
          {{ t('settings.pages.card.speech.voice') }}
        </label>
        <ComboboxSelect v-model="speechVoiceId" :options="props.speechVoiceOptions" :placeholder="defaultPlaceholder(props.defaultSpeechVoiceId)" :disabled="!speechProvider && !props.defaultSpeechProvider" class="w-full" />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2', 'sm:col-span-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-solar:ghost-bold-duotone />
          {{ t('settings.pages.card.body-model') }}
        </label>
        <ComboboxSelect v-model="displayModelId" :options="props.displayModelOptions" :placeholder="defaultPlaceholder(props.defaultDisplayModelId)" class="w-full" />
      </div>
    </div>
  </div>
</template>
