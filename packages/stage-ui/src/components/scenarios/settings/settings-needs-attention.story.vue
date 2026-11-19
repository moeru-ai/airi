<script setup lang="ts">
import type { SettingsNeedsAttentionItem } from '../../../composables/use-settings-needs-attention'

import { shallowRef } from 'vue'

import SettingsNeedsAttention from './settings-needs-attention.vue'

const sample: SettingsNeedsAttentionItem[] = [
  {
    id: 'minimax-speech',
    title: 'MiniMax Speech is not set up',
    detail: 'Used by Speech',
    fallbackIcon: 'i-solar:user-speak-rounded-bold-duotone',
    modules: ['Speech'],
    blocking: true,
    to: '/settings/providers/speech/minimax-speech',
  },
  {
    id: 'speech:default',
    title: 'AIRI has no voice',
    detail: 'Replies are text only · ElevenLabs',
    fallbackIcon: 'i-solar:user-speak-rounded-bold-duotone',
    modules: ['Speech'],
    blocking: true,
    to: '/settings/modules/speech',
  },
  {
    id: 'openai',
    title: 'OpenAI failed its last check',
    detail: 'Model list check failed: 401 Incorrect API key provided. · Used by Consciousness',
    icon: 'i-lobe-icons:openai',
    fallbackIcon: 'i-solar:ghost-bold-duotone',
    modules: ['Consciousness'],
    blocking: false,
    to: '/settings/providers/chat/openai',
  },
  {
    id: 'vision-ollama',
    title: 'Ollama failed its last check',
    detail: 'Connectivity check failed: Failed to fetch · Used by Vision',
    icon: 'i-lobe-icons:ollama',
    fallbackIcon: 'i-solar:eye-closed-bold-duotone',
    modules: ['Vision'],
    blocking: false,
    to: '/settings/providers/vision/ollama',
  },
]

const items = shallowRef(sample)
const fixed = shallowRef('')

function dismiss(item: SettingsNeedsAttentionItem) {
  items.value = items.value.filter(entry => entry.id !== item.id)
}
</script>

<template>
  <Story title="Settings Needs Attention" group="misc">
    <Variant id="many" title="Four items">
      <div :class="['flex flex-col gap-4 p-4']">
        <SettingsNeedsAttention :items="items" @fix="fixed = $event.to" @dismiss="dismiss" />
        <p>Edit opens: {{ fixed || '—' }}. Dismiss removes the row.</p>
      </div>
    </Variant>
    <Variant id="one-unconfigured" title="One provider, not set up">
      <div :class="['p-4']">
        <SettingsNeedsAttention :items="sample.slice(0, 1)" />
      </div>
    </Variant>
    <Variant id="one-speech" title="One character without a voice">
      <div :class="['p-4']">
        <SettingsNeedsAttention :items="sample.slice(1, 2)" />
      </div>
    </Variant>
    <Variant id="one-failed" title="One provider, check failed">
      <div :class="['p-4']">
        <SettingsNeedsAttention :items="sample.slice(2, 3)" />
      </div>
    </Variant>
  </Story>
</template>
