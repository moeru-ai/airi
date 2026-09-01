<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'

import type { Author } from '../functions/authors.data'

import { tryCatch } from '@moeru/std'
import { intlFormat } from 'date-fns'
import { AnimatePresence, Motion } from 'motion-v'
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui'
import { Content, useData, useRoute, withBase } from 'vitepress'
import { computed, ref, toRefs, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// import DocCarbonAds from '../components/DocCarbonAds.vue'
import DocCommunity from '../components/DocCommunity.vue'
import DocFooter from '../components/DocFooter.vue'
import DocOutline from '../components/DocOutline.vue'
import DocSidebar from '../components/DocSidebar.vue'
import DocTopbar from '../components/DocTopbar.vue'

import { isBetweenHalloweenAndHalfOfNovember } from '../composables/date'
import { flatten } from '../utils/flatten'

import * as authorsData from '../functions/authors.data'

const { t } = useI18n()
const { theme, frontmatter } = useData()
const { path } = toRefs(useRoute())

/**
 * Normalizes a document route or sidebar link before matching.
 *
 * Before:
 * - "/zh-Hans/docs/manual/config/providers/consciousness/official.html"
 * - "/zh-Hans/docs/manual/config/providers/consciousness/official/"
 *
 * After:
 * - "/zh-Hans/docs/manual/config/providers/consciousness/official"
 */
function normalizeDocumentPath(value: string): string {
  const withoutDocumentExtension = value.replace(/(?:\/index)?\.(?:html|md)$/, '')
  const withoutTrailingSlash = withoutDocumentExtension.replace(/\/+$/, '')

  return withoutTrailingSlash || '/'
}

const sidebar = computed(() => theme.value.sidebar as DefaultTheme.SidebarItem[])
const activeSection = computed(() => {
  const currentPath = normalizeDocumentPath(path.value)

  return sidebar.value.find(section =>
    flatten(section.items ?? [], 'items').some(item =>
      item.link != null && normalizeDocumentPath(item.link) === currentPath,
    ),
  )
})

const isSidebarEnabled = computed(() => {
  if (frontmatter.value.sidebar === false) {
    return false
  }

  return true
})
const isOutlineEnabled = computed(() => {
  if (frontmatter.value.outline === false) {
    return false
  }

  return true
})
const isCommunityEnabled = computed(() => {
  if (frontmatter.value.community === false) {
    return false
  }

  return true
})

const isCharactersPage = computed(() => path.value.includes('characters'))

const publishedAt = computed(() => {
  if (frontmatter.value.publishedAtOverride) {
    return frontmatter.value.publishedAtOverride
  }

  let date: string = ''
  if (frontmatter.value.publishedAt) {
    date = frontmatter.value.publishedAt
  }
  if (frontmatter.value.date) {
    date = frontmatter.value.data
  }
  if (!date) {
    return undefined
  }

  const { data, error } = tryCatch(() => intlFormat(new Date(frontmatter.value.publishedAt), { dateStyle: 'long' }))
  if (error) {
    console.error('Error formatting publishedAt date:', error)
    return undefined
  }

  return data
})

const authors = computed(() => {
  const data = (authorsData as unknown as { data: Array<{ url: string, authors: Author[] }> }).data
  const currentPath = normalizeDocumentPath(path.value)

  return data.find(item =>
    normalizeDocumentPath(withBase(item.url)) === currentPath,
  )?.authors || []
})

// Title snapshot keyed by `path`: `frontmatter` updates before the article
// key changes, which would swap the leaving page's title to the new one.
const pageTitle = ref(frontmatter.value.title || '')

watch(path, () => {
  pageTitle.value = frontmatter.value.title || ''
})
</script>

<template>
  <div class="w-full">
    <div
      class="pointer-events-none absolute inset-0 left-0 top-0 z-0 h-max w-full flex justify-center overflow-hidden"
    >
      <div class="w-[108rem] flex flex-none justify-end">
        <ClientOnly>
          <img
            v-if="isBetweenHalloweenAndHalfOfNovember(new Date())"
            class="max-w-none w-[90rem] flex-none"
            decoding="async"
            src="/new-bg-halloween.avif"
            alt="backdrop"
          >
          <img
            v-else
            class="max-w-none w-[90rem] flex-none"
            decoding="async"
            src="/new-bg.avif"
            alt="backdrop"
          >
        </ClientOnly>
      </div>
    </div>

    <DocTopbar />

    <main class="flex">
      <aside v-if="isSidebarEnabled" class="sticky top-[7.25rem] hidden h-full max-h-[calc(100vh-7.25rem)] w-[17rem] flex-shrink-0 overflow-y-auto py-4 pl-4 pr-4 md:block">
        <div v-if="activeSection" class="h-full flex flex-col gap-1 font-sans">
          <DocSidebar :items="activeSection.items ?? []" />
        </div>
        <div class="h-6 w-full" />
      </aside>

      <div class="flex-1 overflow-x-hidden px-6 py-6 md:px-24 md:py-12">
        <!-- Section name for mobile (desktop has the sidebar) -->
        <div class="mb-2 text-sm text-primary font-bold md:hidden">
          {{ activeSection?.text }}
        </div>
        <AnimatePresence mode="wait" :initial="false">
          <Motion
            :key="path"
            as-child
            :initial="{ opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: -8 }"
            :transition="{ duration: 0.2, ease: 'easeInOut' }"
          >
            <article
              class="docs-article max-w-none w-full font-sans prose prose-slate dark:prose-invert"
            >
              <h1>
                {{ pageTitle }}
              </h1>

              <div v-if="publishedAt || authors && authors.length" class="mb-10 mt-5 flex flex-col gap-3 sm:gap-5">
                <div v-if="publishedAt" class="text-neutral-400 dark:text-neutral-500">
                  <span>
                    {{ t('docs.theme.doc.published-at', { date: publishedAt }) }}
                  </span>
                </div>

                <div class="flex flex-row gap-2 sm:gap-4">
                  <!-- Authors -->
                  <div v-for="(author, index) of authors" :key="index" class="flex flex-row items-center gap-2.5">
                    <AvatarRoot class="size-10 inline-flex select-none items-center justify-center overflow-hidden rounded-full bg-neutral-100 align-middle dark:bg-neutral-800">
                      <AvatarImage
                        class="h-full w-full rounded-[inherit] object-cover"
                        :src="author.avatar || author.avatarFallback"
                        :alt="`${author.displayName}'s avatar`"
                      />
                      <AvatarFallback
                        class="h-full w-full flex items-center justify-center bg-white text-sm text-primary font-medium leading-1 dark:bg-neutral-800 dark:text-neutral-300"
                        :delay-ms="600"
                        as-child
                      >
                        {{
                          [
                            author.displayName.charAt(0).toUpperCase(),
                            author.displayName.charAt(1).toUpperCase(),
                          ].join('')
                        }}
                      </AvatarFallback>
                    </AvatarRoot>

                    <div class="flex flex-col">
                      <div>
                        <span>{{ author.displayName }}</span>
                      </div>
                      <div v-if="author.githubUsername">
                        <a :href="`https://github.com/${author.githubUsername}`" target="_blank" rel="noopener noreferrer" class="text-sm text-primary hover:underline">
                          <span>{{ author.githubUsername }}</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Content />
            </article>
          </Motion>
        </AnimatePresence>

        <DocFooter v-if="!isCharactersPage" />
      </div>

      <div
        v-if="!isCharactersPage && (isOutlineEnabled || isCommunityEnabled)"
        class="no-scrollbar sticky top-[7.25rem] hidden h-[calc(100vh-7.25rem)] w-64 flex-shrink-0 flex-col overflow-y-auto py-12 pl-2 xl:flex space-y-6 md:overflow-x-hidden"
      >
        <DocOutline v-if="isOutlineEnabled" />
        <DocCommunity v-if="isCommunityEnabled" />
        <div class="grow" />
        <!-- <DocCarbonAds /> -->

        <div class="fixed bottom-0 z-10 h-12 w-64 from-transparent to-background bg-gradient-to-b" />
      </div>
    </main>
  </div>
</template>
