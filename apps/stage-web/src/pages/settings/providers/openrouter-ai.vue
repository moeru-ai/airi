<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import { Collapsable } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { useToggle } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Get provider metadata
const providerId = 'openrouter-ai'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

// Use computed properties for settings
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

const advancedVisible = ref(false)
const toggleAdvancedVisible = useToggle(advancedVisible)

onMounted(() => {
  providersStore.initializeProvider(providerId)

  // Initialize refs with current values
  apiKey.value = providers.value[providerId]?.apiKey || ''
  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.baseUrl || ''
})

// Watch settings and update the provider configuration
watch([apiKey, baseUrl], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || providerMetadata.value?.defaultOptions?.baseUrl || '',
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions as any),
  }
}
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
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
        <div flex="~ row" items-center justify-between>
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
              Basic
            </h2>
            <div text="neutral-400 dark:neutral-500">
              <span>Essential settings</span>
            </div>
          </div>
          <button
            title="Reset settings"
            flex items-center justify-center rounded-full p-2
            transition="all duration-250 ease-in-out"
            text="neutral-500 dark:neutral-400"
            bg="transparent dark:transparent hover:neutral-200 dark:hover:neutral-800 active:neutral-300 dark:active:neutral-700"
            @click="handleResetSettings"
          >
            <div i-solar:refresh-bold-duotone text-xl />
          </button>
        </div>
        <div max-w-full>
          <label flex="~ col gap-4">
            <div>
              <div class="flex items-center gap-1 text-sm font-medium">
                API Key
                <span class="text-red-500">*</span>
              </div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400" text-nowrap>
                API Key for {{ providerMetadata?.localizedName }}
              </div>
            </div>
            <input
              v-model="apiKey"
              type="password"
              border="neutral-200 dark:neutral-800 solid 2 focus:neutral-400 dark:focus:neutral-600"
              transition="all duration-250 ease-in-out"
              w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none
              bg="neutral-100 dark:neutral-800 focus:white dark:focus:neutral-700"
              placeholder="sk-or-..."
            >
          </label>
        </div>
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
          <label flex="~ col gap-4">
            <div>
              <div class="flex items-center gap-1 text-sm font-medium">
                Base URL
              </div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400" text-nowrap>
                Custom base URL (optional)
              </div>
            </div>
            <input
              v-model="baseUrl"
              type="text"
              border="neutral-200 dark:neutral-800 solid 2 focus:neutral-400 dark:focus:neutral-600"
              transition="all duration-250 ease-in-out"
              w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none
              bg="neutral-100 dark:neutral-800 focus:white dark:focus:neutral-700"
              :placeholder="providerMetadata?.defaultOptions?.baseUrl as string || ''"
            >
          </label>
        </div>
      </Collapsable>
    </div>
  </div>
  <div text="neutral-100/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 translate-x-10 translate-y-10>
    <div text="40" :class="providerMetadata?.icon" />
  </div>
</template>
