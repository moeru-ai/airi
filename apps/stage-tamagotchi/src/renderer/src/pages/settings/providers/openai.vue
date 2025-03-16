<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { useToggle } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const apiKey = ref(providers.value.openai?.apiKey || '')
const baseUrl = ref(providers.value.openai?.baseUrl || '')

const advancedVisible = ref(false)
const toggleAdvancedVisible = useToggle(advancedVisible)

onMounted(() => {
  if (!providers.value.openai) {
    providers.value.openai = {
      baseUrl: 'https://api.openai.com/v1/',
    }
  }
})

watch([apiKey, baseUrl], () => {
  providers.value.openai = {
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || 'https://api.openai.com/v1/',
  }
})
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
        OpenAI
      </div>
    </h1>
  </div>
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
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
                API Key for OpenAI
              </div>
            </div>
            <input
              v-model="apiKey" type="password"
              border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
              transition="border duration-250 ease-in-out"
              w-full rounded px-2 py-1 text-nowrap text-sm outline-none
              placeholder="sk-..."
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
              placeholder="https://api.openai.com/v1/"
            >
          </label>
        </div>
      </Collapsable>
    </div>
  </div>
  <div text="neutral-100/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 translate-x-10 translate-y-10>
    <div text="40" i-lobe-icons:openai />
  </div>
</template>
