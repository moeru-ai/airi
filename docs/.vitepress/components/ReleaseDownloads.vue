<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { data as releases } from '../data/releases.data'

const { t } = useI18n()

interface ReleaseCardConfig {
  icon: string
  titleKey: string
  tagColorClass: string
  fallbackUrl: string
  useCases: string[]
}

// Get latest stable release
const latestStable = computed(() => {
  return releases.stable.length > 0 ? releases.stable[0] : null
})

// Get latest prerelease
const latestPrerelease = computed(() => {
  return releases.prerelease.length > 0 ? releases.prerelease[0] : null
})

// Card configurations
const stableConfig: ReleaseCardConfig = {
  icon: 'i-lucide:package-check',
  titleKey: 'docs.versions.download-buttons.latest-stable',
  tagColorClass: 'bg-green-400/10 text-green-900 dark:bg-green-600/10 dark:text-green-400',
  fallbackUrl: 'https://github.com/moeru-ai/airi/releases/latest',
  useCases: [
    'docs.versions.download-buttons.stable-use-case-1',
    'docs.versions.download-buttons.stable-use-case-2',
    'docs.versions.download-buttons.stable-use-case-3',
  ],
}

const prereleaseConfig: ReleaseCardConfig = {
  icon: 'i-lucide:package',
  titleKey: 'docs.versions.download-buttons.latest-prerelease',
  tagColorClass: 'bg-yellow-400/10 text-yellow-900 dark:bg-yellow-600/10 dark:text-yellow-400',
  fallbackUrl: 'https://github.com/moeru-ai/airi/releases',
  useCases: [
    'docs.versions.download-buttons.prerelease-use-case-1',
    'docs.versions.download-buttons.prerelease-use-case-2',
    'docs.versions.download-buttons.prerelease-use-case-3',
  ],
}
</script>

<template>
  <div class="cards-container">
    <!-- Stable Release Card -->
    <div class="release-card">
      <div flex items-center gap-2 text-5xl>
        <div :class="stableConfig.icon" />
      </div>
      <span>{{ t(stableConfig.titleKey) }}</span>
      <div
        v-if="latestStable"
        class="version-tag"
        :class="stableConfig.tagColorClass"
      >
        {{ latestStable.tag_name }}
      </div>

      <!-- Use Cases -->
      <div class="use-cases">
        <ul my-0 flex flex-col list-disc gap-1 pl-5 op-70>
          <li v-for="useCase in stableConfig.useCases" :key="useCase">
            {{ t(useCase) }}
          </li>
        </ul>
      </div>

      <a
        :href="latestStable?.html_url || stableConfig.fallbackUrl"
        target="_blank"
        class="download-button"
      >
        {{ t('docs.versions.download-buttons.download') }}
      </a>
    </div>

    <!-- Prerelease Card -->
    <div class="release-card">
      <div flex items-center gap-2 text-5xl>
        <div :class="prereleaseConfig.icon" />
      </div>
      <span>{{ t(prereleaseConfig.titleKey) }}</span>
      <div
        v-if="latestPrerelease"
        class="version-tag"
        :class="prereleaseConfig.tagColorClass"
      >
        {{ latestPrerelease.tag_name }}
      </div>

      <!-- Use Cases -->
      <div class="use-cases">
        <ul my-0 flex flex-col list-disc gap-1 pl-5 op-70>
          <li v-for="useCase in prereleaseConfig.useCases" :key="useCase">
            {{ t(useCase) }}
          </li>
        </ul>
      </div>

      <a
        :href="latestPrerelease?.html_url || prereleaseConfig.fallbackUrl"
        target="_blank"
        class="download-button"
      >
        {{ t('docs.versions.download-buttons.download') }}
      </a>
    </div>
  </div>
</template>

<style scoped>
.cards-container {
  --at-apply: w-full flex flex-col justify-center gap-2 text-xl;
}

@media (min-width: 768px) {
  .cards-container {
    --at-apply: flex-row;
  }
}

.release-card {
  --at-apply: w-full flex flex-col items-center gap-3 rounded-lg px-4 pb-4 pt-6 border-2 border-solid border-gray-500/10 flex-1;
}

.version-tag {
  --at-apply: rounded-full px-3 py-1 text-sm font-medium;
}

.use-cases {
  --at-apply: my-2 w-full flex flex-col items-center text-sm flex-1;
}

.download-button {
  --at-apply: not-prose block rounded-lg px-4 py-2 text-base decoration-none transition-all duration-200 ease-in-out active:scale-95 bg-primary-400/10 text-primary-900 dark:bg-primary-600/10 dark:text-primary-400;
}
</style>
