<script setup lang="ts">
import { useScroll } from '@vueuse/core'
import { TooltipProvider } from 'reka-ui'
import { useData, useRoute, withBase } from 'vitepress'
import { computed, onMounted, toRefs, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Home from '../components/Home.vue'
import Navbar from '../components/Navbar.vue'
import SearchTrigger from '../components/SearchTrigger.vue'
import Docs from './Docs.vue'
import Showcase from './Showcase.vue'

import { themeColorFromValue, useThemeColor } from '../composables/theme-color'

const { site, theme, frontmatter, lang, isDark } = useData<{ logo: string }>()
const route = useRoute()

const { locale } = useI18n()
const { arrivedState } = useScroll(globalThis.window)

const { top } = toRefs(arrivedState)
const logo = computed(() => theme.value.logo)
const title = computed(() => site.value.title)
const layout = computed(() => frontmatter.value.layout)
const isHome = computed(() => layout.value === 'home')

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(isDark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

watch(lang, () => locale.value = lang.value, { immediate: true })
</script>

<template>
  <TooltipProvider>
    <div class="h-full min-h-screen flex flex-col items-center font-sans-rounded">
      <header
        class="sticky top-0 z-20 h-[68px] w-full py-4 transition-all duration-500"
        :class="[
          top && !isHome ? 'bg-transparent backdrop-blur-0' : 'bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/90',
        ]"
      >
        <div class="mx-auto max-w-[1440px] flex items-center justify-between px-6">
          <div class="w-full flex items-center justify-between gap-8 md:justify-normal">
            <a
              :href="withBase(`/${lang}/`)"
              class="flex translate-y--1 items-center gap-2"
            >
              <img
                class="w-6 md:w-9"
                alt="Project AIRI logo"
                :src="logo"
              >
              <span class="translate-y-1 text-xl font-bold font-sans-rounded md:text-2xl">{{ title }}</span>
            </a>
            <SearchTrigger />
          </div>

          <Navbar />
        </div>
      </header>

      <div v-if="layout === 'home'" class="w-full flex flex-1 flex-col justify-between">
        <main h-full w-full flex flex-1 flex-col justify-between>
          <Home />
        </main>
      </div>

      <div v-else-if="layout === 'showcase'" class="h-full max-w-[1440px] w-full grow">
        <Showcase />
      </div>

      <div v-else class="h-full max-w-[1440px] w-full grow">
        <Docs />
      </div>
    </div>
  </TooltipProvider>
</template>
