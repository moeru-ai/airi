<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'

import { Content, useData, useRoute } from 'vitepress'
import { computed, toRefs } from 'vue'

// import DocCarbonAds from '../components/DocCarbonAds.vue'
import DocCommunity from '../components/DocCommunity.vue'
import DocFooter from '../components/DocFooter.vue'
import DocOutline from '../components/DocOutline.vue'
import DocSidebar from '../components/DocSidebar.vue'
import DocTopbar from '../components/DocTopbar.vue'

import { isBetweenHalloweenAndHalfOfNovember } from '../composables/date'
import { flatten } from '../utils/flatten'

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
