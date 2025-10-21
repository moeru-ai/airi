<script setup lang="ts">
import type { NightlyBuild, Release } from '../data/releases.data'

import { useData } from 'vitepress'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { data as releases } from '../data/releases.data'

const props = defineProps<{
  limit?: number
  locale?: string
  type?: 'all' | 'nightly'
}>()
const { lang } = useData()
const { t } = useI18n()

// Separate computed properties for different types
const nightlyReleases = computed<NightlyBuild[]>(() => {
  if (props.type === 'nightly') {
    return releases.nightly
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, props.limit || 10)
  }
  return []
})

const regularReleases = computed<Release[]>(() => {
  if (props.type !== 'nightly') {
    const merged = [...releases.stable, ...releases.prerelease]
    return merged
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, props.limit || 10)
  }
  return []
})

const isNightly = computed(() => props.type === 'nightly')

function formatDate(dateString: string, locale?: string) {
  const date = new Date(dateString)
  const currentLang = locale || lang.value || 'en'
  const localeMap: Record<string, string> = {
    'en': 'en-US',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
  }

  return date.toLocaleDateString(localeMap[currentLang] || currentLang, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getVersionBadgeClass(type: 'stable' | 'prerelease' | 'nightly') {
  const classes = {
    nightly: 'bg-blue-400/10 text-blue-900 dark:bg-blue-600/10 dark:text-blue-400',
    prerelease: 'bg-yellow-400/10 text-yellow-900 dark:bg-yellow-600/10 dark:text-yellow-400',
    stable: 'bg-green-400/10 text-green-900 dark:bg-green-600/10 dark:text-green-400',
  }
  return classes[type]
}

function getVersionLabel(type: 'stable' | 'prerelease' | 'nightly') {
  const labels = {
    nightly: t('docs.versions.releases-list.nightly'),
    prerelease: t('docs.versions.releases-list.prerelease'),
    stable: t('docs.versions.releases-list.stable'),
  }
  return labels[type]
}
</script>

<template>
  <div v-if="nightlyReleases.length > 0 || regularReleases.length > 0" class="releases-list">
    <div
      v-for="release in nightlyReleases"
      :key="release.id"
      class="release-item"
    >
      <div class="release-header">
        <a :href="release.html_url" target="_blank" class="release-title">
          {{ release.name }}
        </a>
        <span :class="['release-badge', getVersionBadgeClass('nightly')]">
          {{ getVersionLabel('nightly') }}
        </span>
        <span :class="['release-badge', getVersionBadgeClass('nightly')]">
          {{ release.head_sha }}
        </span>
      </div>
      <div class="release-date">
        {{ t('docs.versions.releases-list.built-on') }} {{ formatDate(release.created_at) }}
      </div>
    </div>

    <div
      v-for="release in regularReleases"
      :key="release.tag_name"
      class="release-item"
    >
      <div class="release-header">
        <a :href="release.html_url" target="_blank" class="release-title">
          {{ release.tag_name }}
        </a>
        <span
          :class="['release-badge', getVersionBadgeClass(release.prerelease ? 'prerelease' : 'stable')]"
        >
          {{ getVersionLabel(release.prerelease ? 'prerelease' : 'stable') }}
        </span>
      </div>
      <div class="release-date">
        {{ t('docs.versions.releases-list.released-on') }} {{ formatDate(release.published_at) }}
      </div>
    </div>
  </div>

  <div v-else class="no-releases">
    <p v-if="isNightly">
      <i18n-t keypath="docs.versions.releases-list.no-nightly">
        <template #link>
          <a :href="releases.nightlyUrl" target="_blank">{{ t('docs.versions.releases-list.workflow-page') }}</a>
        </template>
      </i18n-t>
    </p>
    <p v-else>
      <i18n-t keypath="docs.versions.releases-list.no-releases">
        <template #link>
          <a href="https://github.com/moeru-ai/airi/releases" target="_blank">{{ t('docs.versions.releases-list.releases-page') }}</a>
        </template>
      </i18n-t>
    </p>
  </div>
</template>

<style scoped>
.releases-list {
  --at-apply: flex flex-col gap-3 my-4;
}

.release-item {
  --at-apply: p-4 rounded-lg transition-all duration-200 ease;
  border: 1px solid var(--vp-c-divider);
}

.release-item:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

.release-header {
  --at-apply: flex items-center gap-3 flex-wrap;
}

.release-title {
  --at-apply: font-semibold text-base decoration-none;
  color: var(--vp-c-brand-1);
}

.release-title:hover {
  --at-apply: underline;
}

.release-badge {
  --at-apply: inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider;
}

.release-date {
  --at-apply: mt-2 text-sm;
  color: var(--vp-c-text-2);
}

.no-releases {
  --at-apply: p-6 text-center rounded-lg;
  color: var(--vp-c-text-2);
  border: 1px dashed var(--vp-c-divider);
}

.no-releases a {
  --at-apply: decoration-none;
  color: var(--vp-c-brand-1);
}

.no-releases a:hover {
  --at-apply: underline;
}
</style>
