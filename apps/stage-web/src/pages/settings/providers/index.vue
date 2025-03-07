<script setup lang="ts">
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

interface ModelProvider {
  id: string
  name: string
  icon?: string
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
    icon: 'i-lobe-icons:openrouter',
    to: '/settings/providers/openrouter',
    configured: configuredForOpenRouter.value,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'i-lobe-icons:openai',
    to: '/settings/providers/openai',
    configured: false,
  },
  {
    id: 'ollama-ai',
    name: 'Ollama',
    icon: 'i-lobe-icons:ollama',
    to: '/settings/providers/ollama',
    configured: false,
  },
  {
    id: 'vllm',
    name: 'vLLM',
    icon: 'i-lobe-icons:vllm-color',
    to: '/settings/providers/vllm',
    configured: false,
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    icon: 'i-simple-icons:elevenlabs',
    to: '/settings/providers/elevenlabs',
    configured: false,
  },
  {
    id: 'xai',
    name: 'xAI',
    icon: 'i-lobe-icons:xai',
    to: '/settings/providers/xai',
    configured: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'i-lobe-icons:deepseek-color',
    to: '/settings/providers/deepseek',
    configured: false,
  },
  {
    id: 'together-ai',
    name: 'Together.ai',
    icon: 'i-lobe-icons:together-color',
    to: '/settings/providers/together',
    configured: false,
  },
  {
    id: 'novita-ai',
    name: 'Novita',
    icon: 'i-lobe-icons:novita-color',
    to: '/settings/providers/novita',
    configured: false,
  },
  {
    id: 'fireworks-ai',
    name: 'Fireworks.ai',
    icon: 'i-lobe-icons:fireworks',
    to: '/settings/providers/fireworks',
    configured: false,
  },
  {
    id: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI',
    icon: 'i-lobe-icons:cloudflare-color',
    to: '/settings/providers/cloudflare',
    configured: false,
  },
  {
    id: 'mistral-ai',
    name: 'Mistral',
    icon: 'i-lobe-icons:mistral-color',
    to: '/settings/providers/mistral',
    configured: false,
  },
  {
    id: 'moonshot-ai',
    name: 'Moonshot AI',
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
  <div grid="~ cols-3 gap-2">
    <div
      v-for="provider in providersList" :key="provider.id"
      bg="neutral-300/50 dark:neutral-600" w-full of-hidden rounded-xl
      flex="~ col 1"
    >
      <RouterLink
        :to="provider.to"
        bg="neutral-100 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250"
        h-full w-full flex items-center gap-1.5 rounded-lg px-4 py-5 outline-none
        class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
      >
        <div flex="~ col 1" gap-1.5>
          <div
            :class="provider.icon" class="provider-icon size-10"
            transition="filter duration-250 ease-in-out"
          />
          <div>
            {{ provider.name }}
          </div>
        </div>
      </RouterLink>
      <div p-2>
        <div v-if="provider.configured" size-3 bg="green-500 dark:green-600" rounded-full />
        <div v-else size-3 bg="neutral-400 dark:neutral-500" rounded-full />
      </div>
    </div>
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
