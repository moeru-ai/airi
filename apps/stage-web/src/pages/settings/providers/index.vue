<script setup lang="ts">
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import IconStatusItem from '../../../components/Menu/IconStatusItem.vue'

interface ModelProvider {
  id: string
  name: string
  description: string
  icon?: string
  iconColor?: string
  iconImage?: string
  to: string
  configured: boolean
}

const router = useRouter()
const providersStore = useProvidersStore()
const { configuredForOpenRouter } = storeToRefs(providersStore)

const providersList = computed<ModelProvider[]>(() => [
  {
    id: 'openrouter-ai',
    name: 'OpenRouter',
    description: 'openrouter.ai',
    icon: 'i-lobe-icons:openrouter',
    to: '/settings/providers/openrouter',
    configured: configuredForOpenRouter.value,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'openai.com',
    icon: 'i-lobe-icons:openai',
    to: '/settings/providers/openai',
    configured: false,
  },
  {
    id: 'ollama-ai',
    name: 'Ollama',
    description: 'ollama.com',
    icon: 'i-lobe-icons:ollama',
    to: '/settings/providers/ollama',
    configured: false,
  },
  {
    id: 'vllm',
    name: 'vLLM',
    description: 'vllm.ai',
    iconColor: 'i-lobe-icons:vllm-color',
    to: '/settings/providers/vllm',
    configured: false,
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'elevenlabs.io',
    icon: 'i-simple-icons:elevenlabs',
    to: '/settings/providers/elevenlabs',
    configured: false,
  },
  {
    id: 'xai',
    name: 'xAI',
    description: 'x.ai',
    icon: 'i-lobe-icons:xai',
    to: '/settings/providers/xai',
    configured: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'deepseek.com',
    iconColor: 'i-lobe-icons:deepseek-color',
    to: '/settings/providers/deepseek',
    configured: false,
  },
  {
    id: 'together-ai',
    name: 'Together.ai',
    description: 'together.ai',
    iconColor: 'i-lobe-icons:together-color',
    to: '/settings/providers/together',
    configured: false,
  },
  {
    id: 'novita-ai',
    name: 'Novita',
    description: 'novita.ai',
    iconColor: 'i-lobe-icons:novita-color',
    to: '/settings/providers/novita',
    configured: false,
  },
  {
    id: 'fireworks-ai',
    name: 'Fireworks.ai',
    description: 'fireworks.ai',
    icon: 'i-lobe-icons:fireworks',
    to: '/settings/providers/fireworks',
    configured: false,
  },
  {
    id: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI',
    description: 'cloudflare.com',
    iconColor: 'i-lobe-icons:cloudflare-color',
    to: '/settings/providers/cloudflare',
    configured: false,
  },
  {
    id: 'mistral-ai',
    name: 'Mistral',
    description: 'mistral.ai',
    iconColor: 'i-lobe-icons:mistral-color',
    to: '/settings/providers/mistral',
    configured: false,
  },
  {
    id: 'moonshot-ai',
    name: 'Moonshot AI',
    description: 'moonshot.ai',
    icon: 'i-lobe-icons:moonshot',
    to: '/settings/providers/moonshot',
    configured: false,
  },
])
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Settings</span>
      </div>
      <div text-3xl font-semibold>
        Providers
      </div>
    </h1>
  </div>
  <div grid="~ cols-2 gap-2">
    <IconStatusItem
      v-for="provider in providersList"
      :key="provider.id"
      :title="provider.name"
      :description="provider.description"
      :icon="provider.icon"
      :icon-color="provider.iconColor"
      :icon-image="provider.iconImage"
      :to="provider.to"
      :configured="provider.configured"
    />
  </div>
  <div fixed bottom-0 right-0 z--1 text="neutral-100/80 dark:neutral-500/20">
    <div text="40" i-lucide:brain translate-x-10 translate-y-10 />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
