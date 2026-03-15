<script setup lang="ts">
import type { NightlyBuild } from '../data/releases.data'

import { useData } from 'vitepress'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { data as releases } from '../data/releases.data'

const props = defineProps<{
  limit?: number
  locale?: string
  type?: 'releases' | 'nightly-builds'
}>()
const { lang } = useData()
const { t } = useI18n()

// Combined releases for display
const displayReleases = computed(() => {
  if (props.type === 'releases') {
    const allReleases = [...releases.stable, ...releases.prerelease]
    allReleases.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    return (props.limit ? allReleases.slice(0, props.limit) : allReleases).map(release => ({
      key: release.tag_name,
      title: release.name || release.tag_name,
      url: release.html_url,
      date: release.published_at,
      type: (release.prerelease ? 'prerelease' : 'stable') as 'prerelease' | 'stable',
      dateLabel: 'docs.versions.releases-list.released-on',
    }))
  }
  else if (props.type === 'nightly-builds') {
    const nightlyBuilds = releases.nightly as NightlyBuild[]
    nightlyBuilds.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return (props.limit ? nightlyBuilds.slice(0, props.limit) : nightlyBuilds).map(build => ({
      key: build.id,
      title: build.name,
      url: build.html_url,
      date: build.created_at,
      shortHash: build.head_sha,
      type: 'nightly' as const,
      dateLabel: 'docs.versions.releases-list.built-on',
    }))
  }
  return []
})

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

function getVersionLabel(item: { type: 'stable' | 'prerelease' | 'nightly', shortHash?: string }) {
  const labels = {
    nightly: `${t('docs.versions.releases-list.nightly')}-${item.shortHash}`,
    prerelease: t('docs.versions.releases-list.prerelease'),
    stable: t('docs.versions.releases-list.stable'),
  }
  return labels[item.type]
}

const emptyStateConfig = computed(() => {
  if (props.type === 'nightly-builds') {
    return {
      messageKey: 'docs.versions.releases-list.no-nightly',
      linkUrl: 'https://github.com/moeru-ai/airi/releases',
      linkTextKey: 'docs.versions.releases-list.workflow-page',
    }
  }
  return {
    messageKey: 'docs.versions.releases-list.no-releases',
    linkUrl: 'https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml',
    linkTextKey: 'docs.versions.releases-list.releases-page',
  }
})
</script>

<template>
  <div v-if="displayReleases.length > 0" class="releases-list">
    <div v-for="item in displayReleases" :key="item.key" class="release-item">
      <div class="release-header">
        <a :href="item.url" target="_blank" class="release-title">
          {{ item.title }}
        </a>
        <span :class="['release-badge', getVersionBadgeClass(item.type)]">
          {{ getVersionLabel(item) }}
        </span>
      </div>
      <div class="release-date">
        {{ t(item.dateLabel) }} {{ formatDate(item.date) }}
      </div>
    </div>
  </div>

  <div v-else class="no-releases">
    <p>
      <i18n-t :keypath="emptyStateConfig.messageKey">
        <template #link>
          <a :href="emptyStateConfig.linkUrl" target="_blank">{{ t(emptyStateConfig.linkTextKey) }}</a>
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
