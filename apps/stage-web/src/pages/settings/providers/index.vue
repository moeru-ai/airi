<script setup lang="ts">
import { IconStatusItem } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

const router = useRouter()
const providersStore = useProvidersStore()
const { allProvidersMetadata } = storeToRefs(providersStore)
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
  <div grid="~ cols-2 gap-4">
    <IconStatusItem
      v-for="provider in allProvidersMetadata"
      :key="provider.id"
      :title="provider.localizedName"
      :description="provider.localizedDescription"
      :icon="provider.icon"
      :icon-color="provider.iconColor"
      :icon-image="provider.iconImage"
      :to="`/settings/providers/${provider.id.replace('-ai', '')}`"
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
