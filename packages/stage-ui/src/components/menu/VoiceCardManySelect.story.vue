<script setup lang="ts">
import { ref } from 'vue'

import VoiceCardManySelect from './VoiceCardManySelect.vue'

const selectedVoiceId = ref('voice1')
const customValue = ref('')
const searchQuery = ref('')

// Sample voice data
const voices = [
  {
    id: 'lNxY9WuCBCZCISASyJ55',
    name: 'Myriam',
    previewURL: 'https://storage.googleapis.com/eleven-public-prod/MCJE2vSmnChGnvdoSpbNO0dcNQw2/voices/MRCOs26Xkzk5vmsL1Q0D/b0a09f0d-6a02-486f-af95-94a0e5306dbd.mp3',
    customizable: true,
    labels: {
      gender: 'Female',
      age: 'Young',
      accent: 'American',
    },
    languages: [
      { name: 'English', code: 'en-US' },
    ],
  },
  {
    id: 'dLhSyo03JRp5WkGpUlz1',
    name: 'Camilla_KM',
    previewURL: 'https://storage.googleapis.com/eleven-public-prod/eOs5vIk28wffcUZAjlcI7i8gBc22/voices/0KK3BzieIeKs5Ripqjpj/2ce47169-01fa-4828-bb61-272f1683b83e.mp3',
    customizable: true,
    labels: {
      gender: 'Female',
      age: 'Young',
      accent: 'American',
    },
    languages: [
      { name: 'English', code: 'en-US' },
    ],
  },
]

// Handle updates
function handleVoiceIdUpdate(value: string) {
  selectedVoiceId.value = value
}

function handleCustomValueUpdate(value: string) {
  customValue.value = value
}

function handleSearchQueryUpdate(value: string) {
  searchQuery.value = value
}
</script>

<template>
  <Story
    title="Voice Preview Player"
    group="menu"
    :layout="{ type: 'grid', width: 800 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default" title="Default">
      <VoiceCardManySelect
        :voices="voices"
        :selected-voice-id="selectedVoiceId"
        @update:selected-voice-id="handleVoiceIdUpdate"
        @update:custom-value="handleCustomValueUpdate"
        @update:search-query="handleSearchQueryUpdate"
      />
    </Variant>

    <Variant id="no-search" title="Without Search">
      <VoiceCardManySelect
        :voices="voices"
        :selected-voice-id="selectedVoiceId"
        :searchable="false"
        @update:selected-voice-id="handleVoiceIdUpdate"
        @update:custom-value="handleCustomValueUpdate"
      />
    </Variant>

    <Variant id="no-visualizer" title="Without Visualizer">
      <VoiceCardManySelect
        :voices="voices"
        :selected-voice-id="selectedVoiceId"
        :show-visualizer="false"
        @update:selected-voice-id="handleVoiceIdUpdate"
        @update:custom-value="handleCustomValueUpdate"
        @update:search-query="handleSearchQueryUpdate"
      />
    </Variant>

    <Variant id="custom-text" title="Custom Text">
      <VoiceCardManySelect
        :voices="voices"
        :selected-voice-id="selectedVoiceId"
        search-placeholder="Find a voice..."
        search-no-results-title="No matching voices"
        search-no-results-description="Please try another search term"
        search-results-text="Showing {count} out of {total} available voices"
        custom-input-placeholder="Name this voice"
        expand-button-text="Expand list"
        collapse-button-text="Collapse list"
        play-button-text="Listen"
        pause-button-text="Stop"
        @update:selected-voice-id="handleVoiceIdUpdate"
        @update:custom-value="handleCustomValueUpdate"
        @update:search-query="handleSearchQueryUpdate"
      />
    </Variant>

    <Variant id="empty" title="No Voices">
      <VoiceCardManySelect
        :voices="[]"
        :selected-voice-id="selectedVoiceId"
        @update:selected-voice-id="handleVoiceIdUpdate"
        @update:custom-value="handleCustomValueUpdate"
        @update:search-query="handleSearchQueryUpdate"
      />
    </Variant>

    <Variant id="many-voices" title="Many Voices">
      <VoiceCardManySelect
        :voices="[...voices, ...voices, ...voices]"
        :selected-voice-id="selectedVoiceId"
        @update:selected-voice-id="handleVoiceIdUpdate"
        @update:custom-value="handleCustomValueUpdate"
        @update:search-query="handleSearchQueryUpdate"
      />
    </Variant>
  </Story>
</template>
