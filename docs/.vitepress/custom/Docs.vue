<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'

import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { Content, useData, useRoute } from 'vitepress'
import { computed, toRefs } from 'vue'

import DocCarbonAds from '../components/DocCarbonAds.vue'
import DocCommunity from '../components/DocCommunity.vue'
import DocFooter from '../components/DocFooter.vue'
import DocOutline from '../components/DocOutline.vue'
import DocSidebar from '../components/DocSidebar.vue'
import DocTopbar from '../components/DocTopbar.vue'
import { flatten } from '../functions/flatten'

const { theme } = useData()
const { path } = toRefs(useRoute())

const sidebar = computed(() => theme.value.sidebar as DefaultTheme.SidebarItem[])
const activeSection = computed(() => sidebar.value.find(section => flatten(section.items ?? [], 'items')?.find(item => item.link === path.value.replace('.html', ''))))

const isExamplePage = computed(() => path.value.includes('examples'))
</script>

<template>
  <div class="w-full">
    <div
      class="pointer-events-none absolute inset-0 left-0 top-0 z-0 h-max w-full flex justify-center overflow-hidden"
    >
      <div class="w-[108rem] flex flex-none justify-end">
        <img
          class="max-w-none w-[90rem] flex-none"
          decoding="async"
          src="/new-bg.png"
          alt="backdrop"
        >
      </div>
    </div>

    <DocTopbar />

    <main class="flex">
      <aside class="sticky top-[7.25rem] h-full max-h-[calc(100vh-7.25rem)] w-[17rem] flex-shrink-0 overflow-y-auto py-4 pl-4 pr-4 hidden md:block">
        <div
          v-if="activeSection"
          class="h-full"
        >
          <DocSidebar :items="activeSection.items ?? []" />
        </div>
        <div class="h-6 w-full" />
      </aside>

      <div class="flex-1 overflow-x-hidden px-6 py-6 md:px-24 md:py-12">
        <CollapsibleRoot
          :key="path"
          class="mb-4 block xl:hidden"
        >
          <CollapsibleTrigger class="border-muted bg-card data-[state=open]:bg-muted mb-2 border rounded-lg px-4 py-2 text-sm">
            On this page
          </CollapsibleTrigger>

          <CollapsibleContent class="data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp ml-4 overflow-hidden">
            <DocOutline collapsible />
          </CollapsibleContent>
        </CollapsibleRoot>

        <div class="mb-2 text-sm text-primary font-bold">
          {{ activeSection?.text }}
        </div>
        <article class="max-w-none w-full prose prose-stone dark:prose-invert">
          <Content />
        </article>

        <DocFooter v-if="!isExamplePage" />
      </div>

      <div
        v-if="!isExamplePage"
        class="no-scrollbar sticky top-[7.25rem] h-[calc(100vh-7.25rem)] w-64 flex-shrink-0 flex-col overflow-y-auto py-12 pl-2 hidden xl:flex space-y-6 md:overflow-x-hidden"
      >
        <DocOutline />
        <DocCommunity />
        <div class="grow" />
        <DocCarbonAds />

        <div class="to-background fixed bottom-0 z-10 h-12 w-64 from-transparent bg-gradient-to-b" />
      </div>
    </main>
  </div>
</template>
