<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { data as releases } from '../data/releases.data'

const props = defineProps<{
  type?: 'stable-prerelease' | 'nightly'
}>()

const { t } = useI18n()

// Get latest stable release
const latestStable = computed(() => {
  return releases.stable.length > 0 ? releases.stable[0] : null
})

// Get latest prerelease
const latestPrerelease = computed(() => {
  return releases.prerelease.length > 0 ? releases.prerelease[0] : null
})

// Get latest nightly build
const latestNightly = computed(() => {
  return releases.nightly.length > 0 ? releases.nightly[0] : null
})

const isNightly = computed(() => props.type === 'nightly')
</script>

<template>
  <div v-if="isNightly" w-full flex justify-center gap-2 text-xl>
    <div
      v-if="latestNightly" border="2 solid yellow-500/10"
      w-full flex flex-col items-center gap-2 rounded-lg px-2 pb-4 pt-6
    >
      <div flex items-center gap-2 text-5xl>
        <div i-lucide:moon-star />
      </div>
      <span>{{ t('docs.versions.download-buttons.latest-nightly') }}</span>
      <div text-sm op-70>
        {{ latestNightly.name }}
      </div>
      <a
        :href="latestNightly.html_url" target="_blank" decoration-none
        class="not-prose block rounded-lg bg-yellow-400/10 px-4 py-2 text-base text-yellow-900 transition-all duration-200 ease-in-out active:scale-95 dark:bg-yellow-600/10 dark:text-yellow-400"
      >
        {{ t('docs.versions.download-buttons.view-release') }}
      </a>
    </div>
    <div v-else border="2 solid yellow-500/10" w-full flex flex-col items-center gap-2 rounded-lg px-2 pb-4 pt-6>
      <div flex items-center gap-2 text-5xl>
        <div i-lucide:moon-star />
      </div>
      <span>{{ t('docs.versions.download-buttons.latest-nightly') }}</span>
      <a
        href="https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml" target="_blank"
        decoration-none
        class="not-prose block rounded-lg bg-yellow-400/10 px-4 py-2 text-base text-yellow-900 transition-all duration-200 ease-in-out active:scale-95 dark:bg-yellow-600/10 dark:text-yellow-400"
      >
        {{ t('docs.versions.download-buttons.view-release') }}
      </a>
    </div>
  </div>

  <div v-else w-full flex justify-center gap-2 text-xl>
    <div
      v-if="latestStable" border="2 solid gray-500/10"
      w-full flex flex-col items-center gap-2 rounded-lg px-2 pb-4 pt-6
    >
      <div flex items-center gap-2 text-5xl>
        <div i-lucide:package-check />
      </div>
      <span>{{ t('docs.versions.download-buttons.latest-stable') }}</span>
      <div text-sm op-70>
        {{ latestStable.tag_name }}
      </div>
      <a
        :href="latestStable.html_url" target="_blank" decoration-none
        class="not-prose block rounded-lg bg-primary-400/10 px-4 py-2 text-base text-primary-900 transition-all duration-200 ease-in-out active:scale-95 dark:bg-primary-600/10 dark:text-primary-400"
      >
        {{ t('docs.versions.download-buttons.download') }}
      </a>
    </div>
    <div v-else border="2 solid gray-500/10" w-full flex flex-col items-center gap-2 rounded-lg px-2 pb-4 pt-6>
      <div flex items-center gap-2 text-5xl>
        <div i-lucide:package-check />
      </div>
      <span>{{ t('docs.versions.download-buttons.latest-stable') }}</span>
      <a
        href="https://github.com/moeru-ai/airi/releases/latest" target="_blank" decoration-none
        class="not-prose block rounded-lg bg-primary-400/10 px-4 py-2 text-base text-primary-900 transition-all duration-200 ease-in-out active:scale-95 dark:bg-primary-600/10 dark:text-primary-400"
      >
        {{ t('docs.versions.download-buttons.download') }}
      </a>
    </div>

    <div
      v-if="latestPrerelease" border="2 solid gray-500/10"
      w-full flex flex-col items-center gap-2 rounded-lg px-2 pb-4 pt-6
    >
      <div flex items-center gap-2 text-5xl>
        <div i-lucide:package />
      </div>
      <span>{{ t('docs.versions.download-buttons.latest-prerelease') }}</span>
      <div text-sm op-70>
        {{ latestPrerelease.tag_name }}
      </div>
      <a
        :href="latestPrerelease.html_url" target="_blank" decoration-none
        class="not-prose block rounded-lg bg-primary-400/10 px-4 py-2 text-base text-primary-900 transition-all duration-200 ease-in-out active:scale-95 dark:bg-primary-600/10 dark:text-primary-400"
      >
        {{ t('docs.versions.download-buttons.download') }}
      </a>
    </div>
    <div v-else border="2 solid gray-500/10" w-full flex flex-col items-center gap-2 rounded-lg px-2 pb-4 pt-6>
      <div flex items-center gap-2 text-5xl>
        <div i-lucide:package />
      </div>
      <span>{{ t('docs.versions.download-buttons.latest-prerelease') }}</span>
      <a
        href="https://github.com/moeru-ai/airi/releases" target="_blank" decoration-none
        class="not-prose block rounded-lg bg-primary-400/10 px-4 py-2 text-base text-primary-900 transition-all duration-200 ease-in-out active:scale-95 dark:bg-primary-600/10 dark:text-primary-400"
      >
        {{ t('docs.versions.download-buttons.download') }}
      </a>
    </div>
  </div>
</template>
