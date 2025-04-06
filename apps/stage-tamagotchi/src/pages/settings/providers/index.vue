<script setup lang="ts">
import { IconStatusItem } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { allProvidersMetadata } = storeToRefs(providersStore)
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
        <span text="neutral-300 dark:neutral-500" text-nowrap>{{ t('settings.title') }}</span>
      </div>
      <div text-nowrap text-3xl font-semibold>
        {{ t('settings.pages.providers.title') }}
      </div>
    </h1>
  </div>
  <div grid="~ cols-2 gap-4">
    <IconStatusItem
      v-for="(provider, index) of allProvidersMetadata"
      :key="provider.id"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + index * 10"
      :delay="index * 50"
      :title="provider.localizedName"
      :description="provider.localizedDescription"
      :icon="provider.icon"
      :icon-color="provider.iconColor"
      :icon-image="provider.iconImage"
      :to="`/settings/providers/${provider.id}`"
      :configured="provider.configured"
    />
  </div>
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[70dvh]" right--15 z--1
    :initial="{ scale: 0.9, opacity: 0 }"
    :enter="{ scale: 1, opacity: 1 }"
    :duration="250"
  >
    <div text="60" i-lucide:brain />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
