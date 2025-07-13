<script setup lang="ts">
import { useScroll } from '@vueuse/core'
import { TooltipProvider } from 'reka-ui'
import { useData } from 'vitepress'
import { computed, toRefs } from 'vue'

// import HomePageDemo from '../components/HomePageDemo.vue'
import Home from '../components/Home.vue'
import Navbar from '../components/Navbar.vue'
import SearchTrigger from '../components/SearchTrigger.vue'
import Docs from './Docs.vue'
import Showcase from './Showcase.vue'

const { site, theme, frontmatter } = useData<{
  logo: string
}>()
const logo = computed(() => theme.value.logo)
const title = computed(() => site.value.title)
const layout = computed(() => frontmatter.value.layout)

const { arrivedState } = useScroll(globalThis.window)
const { top } = toRefs(arrivedState)
</script>

<template>
  <TooltipProvider>
    <div class="h-full min-h-screen flex flex-col items-center">
      <header
        class="sticky top-0 z-20 h-[68px] w-full py-4 transition-all duration-500 md:h-full"
        :class="[top ? 'bg-transparent backdrop-blur-0' : 'bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/90']"
      >
        <div class="mx-auto max-w-[1440px] flex items-center justify-between px-6">
          <div class="w-full flex items-center justify-between gap-8 md:justify-normal">
            <a
              href="/"
              class="flex items-center gap-2"
            >
              <img
                class="w-6 md:w-9"
                alt="Reka UI logo"
                :src="logo"
              >
              <span class="text-xl font-bold md:text-2xl">{{ title }}</span>
            </a>
            <SearchTrigger />
          </div>

          <Navbar />
        </div>
      </header>

      <div
        v-if="layout === 'home'"
        class="h-full w-full flex flex-1 flex-col justify-between"
      >
        <main>
          <Home />
          <!-- <Content /> -->
        </main>

      <!-- <footer class="py-4">
        footer
      </footer> -->
      </div>

      <div
        v-else-if="layout === 'showcase'"
        class="h-full max-w-[1440px] w-full grow"
      >
        <Showcase />
      </div>

      <div
        v-else
        class="h-full max-w-[1440px] w-full grow"
      >
        <Docs />
      </div>
    </div>
  </TooltipProvider>
</template>
