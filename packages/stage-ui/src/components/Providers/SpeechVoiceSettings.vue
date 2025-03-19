<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { FieldCheckbox, FieldRange } from '../index'

defineProps<{
  settings: Record<string, any>
  // Which settings to show
  showPitch?: boolean
  showSpeed?: boolean
  showStyle?: boolean
  showStability?: boolean
  showSimilarityBoost?: boolean
  showVolume?: boolean
  showSpeakerBoost?: boolean
}>()

const emit = defineEmits<{
  update: [key: string, value: any]
}>()

const { t } = useI18n()

// Define a function to update settings
function updateSetting(key: string, value: any) {
  emit('update', key, value)
}
</script>

<template>
  <div flex="~ col gap-4">
    <!-- Pitch control - common to most providers -->
    <FieldRange
      v-if="showPitch"
      :model-value="settings.pitch ?? 0"
      :label="t('settings.pages.providers.provider.common.fields.field.pitch.label')"
      :description="t('settings.pages.providers.provider.common.fields.field.pitch.description')"
      :min="-100"
      :max="100" :step="1" :format-value="value => `${value}%`"
      @update:model-value="value => updateSetting('pitch', value)"
    />

    <!-- Speed control - common to most providers -->
    <FieldRange
      v-if="showSpeed"
      :model-value="settings.speed ?? 1.0"
      :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
      :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
      :min="0.5"
      :max="2.0" :step="0.01" @update:model-value="value => updateSetting('speed', value)"
    />

    <!-- Volume control - available in some providers -->
    <FieldRange
      v-if="showVolume"
      :model-value="settings.volume ?? 0"
      :label="t('settings.pages.providers.provider.common.fields.field.volume.label')"
      :description="t('settings.pages.providers.provider.common.fields.field.volume.description')"
      :min="-100"
      :max="100" :step="1" :format-value="value => `${value}%`"
      @update:model-value="value => updateSetting('volume', value)"
    />

    <!-- Style control - specific to ElevenLabs -->
    <FieldRange
      v-if="showStyle"
      :model-value="settings.style ?? 0"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.style.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.style.description')"
      :min="0"
      :max="1" :step="0.01" @update:model-value="value => updateSetting('style', value)"
    />

    <!-- Stability control - specific to ElevenLabs -->
    <FieldRange
      v-if="showStability"
      :model-value="settings.stability ?? 0.5"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.description')"
      :min="0"
      :max="1" :step="0.01" @update:model-value="value => updateSetting('stability', value)"
    />

    <!-- Similarity Boost control - specific to ElevenLabs -->
    <FieldRange
      v-if="showSimilarityBoost"
      :model-value="settings.similarityBoost ?? 0.75"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.description')"
      :min="0"
      :max="1" :step="0.01" @update:model-value="value => updateSetting('similarityBoost', value)"
    />

    <!-- Speaker Boost checkbox - specific to ElevenLabs -->
    <FieldCheckbox
      v-if="showSpeakerBoost"
      :model-value="settings.useSpeakerBoost !== false"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.description')"
      @update:model-value="value => updateSetting('useSpeakerBoost', value)"
    />

    <!-- Slot for additional provider-specific controls -->
    <slot />
  </div>
</template>
