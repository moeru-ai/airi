<script setup lang="ts">
import { useSettings } from '../stores/settings'

const settings = useSettings()
</script>

<template>
  <div space-x="2" flex="~ row" w-full>
    <div flex="~ row" w-full>
      <input
        v-model="settings.openAiApiBaseURL"
        placeholder="Input your API base URL"
        p="2" bg="zinc-100 dark:zinc-700" w-full rounded-lg outline-none
      >
    </div>
    <div flex="~ row" w-full>
      <input
        v-model="settings.openAiApiKey"
        placeholder="Input your API key"
        p="2" bg="zinc-100 dark:zinc-700" w-full rounded-lg outline-none
      >
    </div>
    <div flex="~ row" w-full>
      <input
        v-model="settings.elevenLabsApiKey"
        placeholder="Input your ElevenLabs API key"
        p="2" bg="zinc-100 dark:zinc-700" w-full rounded-lg outline-none
      >
    </div>
  </div>
</template>
