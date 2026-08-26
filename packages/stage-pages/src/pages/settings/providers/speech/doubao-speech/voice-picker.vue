<script setup lang="ts">
import { doubaoOfficialVoices, isDoubaoOfficialVoice } from '@proj-airi/stage-ui/libs/providers/providers/doubao-speech/voice-catalog'
import { FieldCombobox, FieldInput, GhostButton } from '@proj-airi/ui'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  resourceId: 'seed-icl-2.0' | 'seed-tts-2.0'
}>()

const speaker = defineModel<string>({ required: true })
const { t } = useI18n()

const officialVoiceOptions = doubaoOfficialVoices.map(voice => ({
  description: `${voice.scene} · ${voice.languages}`,
  label: `${voice.name} · ${voice.id}`,
  value: voice.id,
}))

const isCloneResource = computed(() => props.resourceId === 'seed-icl-2.0')
const manualMode = shallowRef(false)

watch(() => props.resourceId, (resourceId) => {
  manualMode.value = resourceId === 'seed-icl-2.0'
    || Boolean(speaker.value && !isDoubaoOfficialVoice(speaker.value))
}, { immediate: true })
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-2']">
    <FieldInput
      v-if="isCloneResource || manualMode"
      v-model="speaker"
      :label="t(`settings.pages.providers.provider.doubao-speech.fields.field.speaker.${isCloneResource ? 'clone-label' : 'manual-label'}`)"
      :description="t(`settings.pages.providers.provider.doubao-speech.fields.field.speaker.${isCloneResource ? 'clone-description' : 'manual-description'}`)"
      :placeholder="t('settings.pages.providers.provider.doubao-speech.fields.field.speaker.manual-placeholder')"
      required
    />

    <FieldCombobox
      v-else
      v-model="speaker"
      :label="t('settings.pages.providers.provider.doubao-speech.fields.field.speaker.official-label')"
      :description="t('settings.pages.providers.provider.doubao-speech.fields.field.speaker.official-description')"
      :placeholder="t('settings.pages.providers.provider.doubao-speech.fields.field.speaker.official-placeholder')"
      :options="officialVoiceOptions"
      :content-min-width="360"
      layout="vertical"
    >
      <template #label>
        <span>{{ t('settings.pages.providers.provider.doubao-speech.fields.field.speaker.official-label') }}</span>
        <span :class="['text-red-500']">*</span>
      </template>
      <template #empty>
        {{ t('settings.pages.providers.provider.doubao-speech.fields.field.speaker.empty') }}
      </template>
    </FieldCombobox>

    <GhostButton
      v-if="!isCloneResource"
      :label="t(`settings.pages.providers.provider.doubao-speech.fields.field.speaker.${manualMode ? 'use-official' : 'use-manual'}`)"
      size="sm"
      @click="manualMode = !manualMode"
    />
  </div>
</template>
