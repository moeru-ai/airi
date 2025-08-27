<script setup lang="ts">
import type { DefaultTheme } from 'vitepress'

import { Icon } from '@iconify/vue'
import { useScroll } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import { useData, useRoute, withBase } from 'vitepress'
import { computed, ref, toRefs, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import DocSidebarItem from '../components/DocSidebarItem.vue'

import { flatten } from '../functions/flatten'

const { path } = toRefs(useRoute())
const { page, theme } = useData()
const { t } = useI18n()

const isSidebarOpen = ref(false)
const sidebar = computed(() => (theme.value.sidebar as (DefaultTheme.SidebarItem & { icon?: string })[]))

const sectionTabs = computed(() => sidebar.value
  .map(val => ({
    label: val.text,
    link: flatten(val.items ?? [], 'items').filter(i => !!i?.link)?.[0]?.link,
    icon: val.icon,
  }))
  .filter(i => !!i?.link),
)

function isCharacterPage(link?: string) {
  if (!link)
    return false
  return link.includes('/characters') || link.includes('/characters/')
}

const { arrivedState } = useScroll(globalThis.window)
const { top } = toRefs(arrivedState)

watch(path, () => {
  isSidebarOpen.value = false
})
</script>

<template>
  <div
    class="border-muted-foreground/10 sticky top-[4.25rem] z-10 h-12 w-full border-y px-4 transition-all duration-500"
    :class="[top ? 'bg-transparent backdrop-blur-0' : 'bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/80']"
  >
    <div class="h-full items-center justify-between hidden md:flex">
      <div class="h-full flex items-center">
        <a
          v-for="tab in sectionTabs.filter(i => !isCharacterPage(i.link))"
          :key="tab.label"
          :href="tab.link"
          :class="{ '!after:bg-primary !text-foreground': withBase(`/${page.relativePath}`).includes(tab.link?.split('/').slice(0, -1).join('/') || '') }"
          class="text-muted-foreground hover:text-foreground hover:border-b-muted relative mx-4 h-full inline-flex items-center py-2 text-sm font-semibold after:absolute after:bottom-0 after:h-0.5 after:w-full after:rounded-t-full after:bg-transparent after:content-['']"
          transition-colors duration-200 ease-in-out
        >
          <Icon
            v-if="tab.icon"
            :icon="tab.icon"
            class="mr-2 text-lg"
          />
          <span>{{ tab.label }}</span>
        </a>
      </div>

      <div class="h-full flex items-center">
        <a
          v-for="tab in sectionTabs.filter(i => isCharacterPage(i.link))"
          :key="tab.label"
          :href="tab.link"
          :class="{ '!after:bg-primary !text-foreground': withBase(page.relativePath).includes(tab.label?.toLowerCase() ?? '') }"
          class="text-muted-foreground hover:text-foreground hover:border-b-muted relative mx-4 h-full inline-flex items-center py-2 text-sm font-semibold after:absolute after:bottom-0 after:h-0.5 after:w-full after:rounded-t-full after:bg-transparent after:content-['']"
          transition-colors duration-200 ease-in-out
        >
          <Icon
            v-if="tab.icon"
            :icon="tab.icon"
            class="mr-2 text-lg"
          />
          <span>{{ tab.label }}</span>
        </a>
      </div>
    </div>

    <div class="h-full flex items-center justify-between md:hidden">
      <DialogRoot v-model:open="isSidebarOpen">
        <DialogTrigger
          aria-label="Menu button"
          class="hover:bg-muted flex items-center rounded-lg p-2"
          transition-colors duration-200 ease-in-out
        >
          <Icon
            icon="lucide:menu"
            class="text-lg"
          />
          <span class="ml-2 text-sm">Menu</span>
        </DialogTrigger>

        <DialogPortal>
          <DialogOverlay class="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
          <DialogContent class="bg-background border-muted data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left data-[state=open]:animate-enterFromLeft data-[state=closed]:animate-exitToLeft fixed inset-y-0 left-0 z-50 h-full w-3/4 gap-4 border-r pr-0 shadow-lg transition ease-in-out sm:max-w-sm">
            <DialogTitle class="sr-only">
              Sidebar menu
            </DialogTitle>
            <DialogDescription class="sr-only">
              List of navigation item
            </DialogDescription>

            <div class="h-full overflow-y-auto pt-8">
              <div
                v-for="group in theme.sidebar"
                :key="group.text"
                class="border-muted mb-4 flex flex-col gap-1 border-b px-4 pb-4"
              >
                <div class="mb-2 ml-2 flex items-center">
                  <Icon
                    v-if="group.icon"
                    :icon="group.icon"
                    class="mx-2 text-lg"
                  />
                  <span class="font-bold">{{ group.text }}</span>
                </div>

                <template
                  v-for="item in group.items"
                  :key="item.text"
                >
                  <ul
                    v-if="item.items?.length"
                    class="[&:not(:last-child)]:mb-6"
                  >
                    <div class="pb-2 pl-4 text-sm font-bold">
                      {{ item.text }}
                    </div>
                    <DocSidebarItem
                      v-for="subitem in item.items"
                      :key="subitem.text"
                      :item="subitem"
                    />
                  </ul>

                  <DocSidebarItem
                    v-else
                    :item="item"
                  />
                </template>
              </div>
              <div class="h-12 w-full" />
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <div class="h-full flex items-center">
        <a
          href="/characters/"
          :class="{ '!border-b-primary !font-semibold !text-foreground': withBase(page.relativePath).includes('characters') }"
          class="text-muted-foreground hover:border-b-muted hover:text-foreground mx-4 h-full inline-flex items-center gap-2 border-b border-b-transparent py-2 text-sm font-medium"
        >
          <Icon
            icon="lucide:scan-face"
            class="text-lg"
          />
          {{ t('docs.theme.pages.characters.title') }}
        </a>
      </div>
    </div>
  </div>
</template>
