<script setup lang="ts">
import { useData } from 'vitepress'

import CardLink from '../components/CardLink.vue'

const { frontmatter } = useData()
</script>

<template>
  <div class="content px-4 pb-20 md:px-0">
    <div class="mx-auto w-full">
      <div class="mb-16 mt-8 flex flex-col md:mb-24 md:mt-24">
        <h1 class="text-4xl font-bold lg:text-5xl">
          Showcase
        </h1>
        <h2 class="text-muted-foreground mt-2 max-w-[640px] font-medium md:mt-6 md:text-xl">
          {{ frontmatter.description }}
        </h2>

        <a
          class="text-primary-foreground mt-4 w-max flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold hover:bg-primary/90"
          target="_blank"
          href="https://github.com/unovue/reka-ui/edit/v2/docs/content/showcase.md"
        >
          Add Showcase
        </a>
      </div>

      <div class="flex flex-col gap-8 md:gap-12">
        <div>
          <h3 class="group ml-2 inline-flex items-center text-primary font-bold md:text-lg">
            Packages
          </h3>
          <div class="grid mt-4 gap-6 lg:grid-cols-3 md:grid-cols-2">
            <CardLink
              v-for="item in frontmatter.packages"
              :key="item.title"
              v-bind="item"
            />
          </div>
        </div>

        <div>
          <h3 class="group ml-2 inline-flex items-center text-primary font-bold md:text-lg">
            Projects
          </h3>
          <div class="grid mt-4 gap-6 lg:grid-cols-3 md:grid-cols-2">
            <CardLink
              v-for="item in frontmatter.projects"
              :key="item.title"
              v-bind="item"
            />
          </div>
        </div>

        <div v-if="frontmatter.starters && frontmatter.starters.length">
          <h3 class="group ml-2 inline-flex items-center text-primary font-bold md:text-lg">
            Starters
          </h3>
          <div class="grid mt-4 gap-6 lg:grid-cols-3 md:grid-cols-2">
            <CardLink
              v-for="item in frontmatter.starters"
              :key="item.title"
              v-bind="item"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
