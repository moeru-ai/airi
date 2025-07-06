<script setup lang="ts">
import type { ContentData } from 'vitepress'

import { Content, useData } from 'vitepress'
import { computed } from 'vue'

import DocTopbar from '../components/DocTopbar.vue'
import ExampleHome from '../components/ExampleHome.vue'
// @ts-expect-error type issue with `createContentLoader`
import { data as examples } from '../functions/examples.data'

const { page } = useData()
const relativePath = computed(() => page.value.relativePath)

const data = computed(() => examples.filter((example: ContentData) => example.url !== '/examples/') as ContentData[])
</script>

<template>
  <div class="w-full">
    <DocTopbar />

    <main v-if="relativePath === 'examples.md'">
      <ExampleHome :data />
    </main>

    <main
      class="flex"
    >
      <div class="flex-1 overflow-x-hidden px-12 py-12">
        <article class="mx-auto w-full max-w-screen-lg prose prose-stone dark:prose-invert">
          <Content />
        </article>
      </div>
    </main>
  </div>
</template>
