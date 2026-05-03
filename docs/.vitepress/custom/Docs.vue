<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'

import type { Author } from '../functions/authors.data'

import { tryCatch } from '@moeru/std'
import { intlFormat } from 'date-fns'
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui'
import { Content, useData, useRoute } from 'vitepress'
import { computed, toRefs } from 'vue'
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

const sidebar = computed(() => theme.value.sidebar as DefaultTheme.SidebarItem[])
const activeSection = computed(() => sidebar.value.find(section => flatten(section.items ?? [], 'items')?.find(item => item.link === path.value.replace('.html', ''))))

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
  return data.find(item => item.url === path.value)?.authors || []
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
        <div class="mb-2 text-sm text-primary font-bold">
          {{ activeSection?.text }}
        </div>
        <article class="docs-article max-w-none w-full font-sans prose prose-slate dark:prose-invert">
          <h1>
            {{ frontmatter.title || '' }}
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
