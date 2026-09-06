<script setup lang="ts">
import { VoicevoxFamilySettings } from '@proj-airi/stage-ui/components'

const providerId = 'voicevox'
</script>

<template>
  <VoicevoxFamilySettings
    :provider-id="providerId"
    intonation-label-key="settings.pages.providers.provider.voicevox.fields.field.intonation.label"
    intonation-description-key="settings.pages.providers.provider.voicevox.fields.field.intonation.description"
    default-text="こんにちは、はじめまして。"
  />
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>
