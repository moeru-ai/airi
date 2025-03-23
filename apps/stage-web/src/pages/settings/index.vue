<script setup lang="ts">
import { IconItem } from '@proj-airi/stage-ui/components'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div
    v-motion
    flex items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :duration="100"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 text-3xl>
      {{ $t('settings.title') }}
    </h1>
  </div>
  <div flex="~ col gap-4">
    <div flex="~ col gap-4">
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :title="$t('settings.pages.modules.title')"
        :description="$t('settings.pages.modules.description')"
        icon="i-lucide:blocks"
        to="/settings/modules"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="50"
        :title="$t('settings.pages.models.title')"
        :description="$t('settings.pages.models.description')"
        icon="i-lucide:person-standing"
        to="/settings/models"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="100"
        :title="$t('settings.pages.memory.title')"
        :description="$t('settings.pages.memory.description')"
        icon="i-lucide:sprout"
        to="/settings/memory"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="100"
        :title="$t('settings.pages.providers.title')"
        :description="$t('settings.pages.providers.description')"
        icon="i-lucide:brain"
        to="/settings/providers"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="150"
        :title="$t('settings.pages.themes.title')"
        :description="$t('settings.pages.themes.description')"
        icon="i-lucide:paintbrush"
        to="/settings/appearance"
      />
    </div>
    <div text="neutral-200/50 dark:neutral-600/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
      <div v-motion text="60" i-lucide:cog />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
