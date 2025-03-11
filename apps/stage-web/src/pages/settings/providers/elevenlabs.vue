<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { useProvidersStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { useToggle } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { providers } = storeToRefs(providersStore)

// Get provider metadata
const providerId = 'elevenlabs'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const apiKey = ref(providers.value[providerId]?.apiKey || '')
const baseUrl = ref(providers.value[providerId]?.baseUrl || '')

// Speech settings
const selectedLanguage = ref(speechStore.selectedLanguage)
const selectedVoice = ref(speechStore.voiceName)
const availableVoices = computed(() => speechStore.availableVoicesForLanguage)

const advancedVisible = ref(false)
const toggleAdvancedVisible = useToggle(advancedVisible)

onMounted(() => {
  providersStore.initializeProvider(providerId)

  // Initialize refs with current values
  apiKey.value = providers.value[providerId]?.apiKey || ''
  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.baseUrlDefault || ''

  // Load voices if provider is configured
  if (providersStore.configuredProviders[providerId]) {
    speechStore.loadVoicesForProvider(providerId)
  }
})

watch([apiKey, baseUrl], () => {
  providers.value[providerId] = {
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || providerMetadata.value?.baseUrlDefault || '',
  }
})

watch(selectedLanguage, (newLanguage) => {
  speechStore.setLanguage(newLanguage)
})

watch(selectedVoice, (newVoice) => {
  speechStore.setVoiceName(newVoice)
})
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Provider</span>
      </div>
      <div text-3xl font-semibold>
        {{ providerMetadata?.localizedName }}
      </div>
    </h1>
  </div>
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-6">
    <div>
      <div flex="~ col gap-6">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            Basic
          </h2>
          <div text="neutral-400 dark:neutral-500">
            <span>Essential settings</span>
          </div>
        </div>
        <div max-w-full>
          <label grid="~ cols-2 gap-4">
            <div>
              <div class="flex items-center gap-1 text-sm font-medium">
                API Key
                <span class="text-red-500">*</span>
              </div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400" text-nowrap>
                API Key for {{ providerMetadata?.localizedName }}
              </div>
            </div>
            <input
              v-model="apiKey" type="password"
              border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
              transition="border duration-250 ease-in-out"
              w-full rounded px-2 py-1 text-nowrap text-sm outline-none
              placeholder="..."
            >
          </label>
        </div>
      </div>
    </div>

    <div flex="~ col gap-6">
      <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
        Voice Settings
      </h2>
      <div flex="~ col gap-6">
        <label grid="~ cols-2 gap-4">
          <div>
            <div class="flex items-center gap-1 text-sm font-medium">
              Language
            </div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
              Select voice language
            </div>
          </div>
          <select
            v-model="selectedLanguage"
            border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
            transition="border duration-250 ease-in-out"
            w-full rounded px-2 py-1 text-nowrap text-sm outline-none
          >
            <option v-for="language in speechStore.availableLanguages" :key="language" :value="language">
              {{ language }}
            </option>
          </select>
        </label>

        <label grid="~ cols-2 gap-4">
          <div>
            <div class="flex items-center gap-1 text-sm font-medium">
              Voice
            </div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
              Select preferred voice
            </div>
          </div>
          <select
            v-model="selectedVoice"
            border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
            transition="border duration-250 ease-in-out"
            w-full rounded px-2 py-1 text-nowrap text-sm outline-none
          >
            <option v-for="voice in availableVoices" :key="voice.id" :value="voice.name">
              {{ voice.name }}
            </option>
          </select>
        </label>

        <label grid="~ cols-2 gap-4">
          <div>
            <div class="flex items-center gap-1 text-sm font-medium">
              Pitch
            </div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
              Adjust voice pitch
            </div>
          </div>
          <div flex="~ row" items-center gap-2>
            <input
              v-model="speechStore.pitch"
              type="range"
              min="-100"
              max="100"
              step="1"
              w-full
            >
            <span class="text-xs">{{ speechStore.pitch }}</span>
          </div>
        </label>

        <label grid="~ cols-2 gap-4">
          <div>
            <div class="flex items-center gap-1 text-sm font-medium">
              Rate
            </div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
              Adjust speaking rate
            </div>
          </div>
          <div flex="~ row" items-center gap-2>
            <input
              v-model="speechStore.rate"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              w-full
            >
            <span class="text-xs">{{ speechStore.rate.toFixed(1) }}</span>
          </div>
        </label>

        <label grid="~ cols-2 gap-4">
          <div>
            <div class="flex items-center gap-1 text-sm font-medium">
              SSML
            </div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
              Enable SSML support
            </div>
          </div>
          <div>
            <input
              v-model="speechStore.ssmlEnabled"
              type="checkbox"
              class="mr-2"
              :disabled="!speechStore.supportsSSML"
            >
            <span class="text-sm">{{ speechStore.ssmlEnabled ? 'Enabled' : 'Disabled' }}</span>
          </div>
        </label>
      </div>
    </div>

    <div>
      <Collapsable w-full>
        <template #trigger="slotProps">
          <button
            transition="all ease-in-out duration-250"
            w-full flex items-center gap-1.5 outline-none
            class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
            @click="() => slotProps.setVisible(!slotProps.visible) && toggleAdvancedVisible()"
          >
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
              <span>Advanced</span>
            </h2>
            <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
              <div i-solar:alt-arrow-down-bold-duotone />
            </div>
          </button>
        </template>
        <div mt-4>
          <label grid="~ cols-2 gap-4">
            <div>
              <div class="flex items-center gap-1 text-sm font-medium">
                Base URL
              </div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400">
                Custom base URL (optional)
              </div>
            </div>
            <input
              v-model="baseUrl" type="text"
              border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
              transition="border duration-250 ease-in-out"
              w-full rounded px-2 py-1 text-nowrap text-sm outline-none
              :placeholder="providerMetadata?.baseUrlDefault"
            >
          </label>

          <div mt-4>
            <button
              border="zinc-300 dark:zinc-800 solid 1"
              transition="border duration-250 ease-in-out"
              rounded
              px-4 py-2 text-sm @click="speechStore.resetVoiceSettings"
            >
              Reset Voice Settings
            </button>
          </div>
        </div>
      </Collapsable>
    </div>
  </div>
  <div fixed bottom-0 right-0 text="neutral-100/80 dark:neutral-500/20">
    <div text="40" :class="providerMetadata?.icon" translate-x-10 translate-y-10 />
  </div>
</template>
