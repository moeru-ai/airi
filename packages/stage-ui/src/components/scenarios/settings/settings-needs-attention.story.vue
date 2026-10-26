<script setup lang="ts">
import type { SettingsNeedsAttentionItem } from '../../../composables/use-settings-needs-attention'

import { shallowRef } from 'vue'

import SettingsNeedsAttention from './settings-needs-attention.vue'

const sample: SettingsNeedsAttentionItem[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'i-lobe-icons:openai',
    fallbackIcon: 'i-solar:ghost-bold-duotone',
    modules: ['Consciousness'],
    reason: 'Model list check failed: 401 Incorrect API key provided.',
    to: '/settings/providers/chat/openai',
  },
  {
    id: 'vision-ollama',
    name: 'Ollama',
    icon: 'i-lobe-icons:ollama',
    fallbackIcon: 'i-solar:eye-closed-bold-duotone',
    modules: ['Vision'],
    reason: 'Connectivity check failed: Failed to fetch',
    to: '/settings/providers/vision/ollama',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    fallbackIcon: 'i-solar:ghost-bold-duotone',
    modules: [],
    reason: '',
    to: '/settings/providers/chat/deepseek',
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
    <Variant id="many" title="Three providers">
      <div :class="['flex flex-col gap-4 p-4']">
        <SettingsNeedsAttention :items="items" @fix="fixed = $event.to" @dismiss="dismiss" />
        <p>Edit opens: {{ fixed || '—' }}. Dismiss removes the row.</p>
      </div>
    </Variant>
    <Variant id="one" title="One provider">
      <div :class="['p-4']">
        <SettingsNeedsAttention :items="sample.slice(0, 1)" />
      </div>
    </Variant>
  </Story>
</template>
