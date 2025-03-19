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

const pitch = defineModel<number>('pitch', { required: false, default: 0 })
const speed = defineModel<number>('speed', { required: false, default: 1.0 })
const volume = defineModel<number>('volume', { required: false, default: 0 })
const style = defineModel<number>('style', { required: false, default: 0 })
const stability = defineModel<number>('stability', { required: false, default: 0.5 })
const similarityBoost = defineModel<number>('similarityBoost', { required: false, default: 0.75 })
const useSpeakerBoost = defineModel<boolean>('useSpeakerBoost', { required: false, default: false })

const { t } = useI18n()
</script>

<template>
  <div flex="~ col gap-4">
    <!-- Pitch control - common to most providers -->
    <FieldRange
      v-if="showPitch"
      v-model="pitch"
      :label="t('settings.pages.providers.provider.common.fields.field.pitch.label')"
      :description="t('settings.pages.providers.provider.common.fields.field.pitch.description')"
      :min="-100"
      :max="100" :step="1" :format-value="value => `${value}%`"
    />

    <!-- Speed control - common to most providers -->
    <FieldRange
      v-if="showSpeed"
      v-model="speed"
      :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
      :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
      :min="0.5"
      :max="2.0" :step="0.01"
    />

    <!-- Volume control - available in some providers -->
    <FieldRange
      v-if="showVolume"
      v-model="volume"
      :label="t('settings.pages.providers.provider.common.fields.field.volume.label')"
      :description="t('settings.pages.providers.provider.common.fields.field.volume.description')"
      :min="-100"
      :max="100" :step="1" :format-value="value => `${value}%`"
    />

    <!-- Style control - specific to ElevenLabs -->
    <FieldRange
      v-if="showStyle"
      v-model="style"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.style.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.style.description')"
      :min="0"
      :max="1" :step="0.01"
    />

    <!-- Stability control - specific to ElevenLabs -->
    <FieldRange
      v-if="showStability"
      v-model="stability"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.description')"
      :min="0"
      :max="1" :step="0.01"
    />

    <!-- Similarity Boost control - specific to ElevenLabs -->
    <FieldRange
      v-if="showSimilarityBoost"
      v-model="similarityBoost"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.description')"
      :min="0"
      :max="1" :step="0.01"
    />

    <!-- Speaker Boost checkbox - specific to ElevenLabs -->
    <FieldCheckbox
      v-if="showSpeakerBoost"
      v-model="useSpeakerBoost"
      :label="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.label')"
      :description="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.description')"
    />

    <!-- Slot for additional provider-specific controls -->
    <slot />
  </div>
</template>
