<script setup lang="ts">
import type { ContentData } from 'vitepress'

import { useRouter } from 'vitepress'
import { computed, onBeforeMount } from 'vue'

// @ts-expect-error type issue with `createContentLoader`
import { data as examples } from '../functions/examples.data'

const router = useRouter()
const data = computed(() => examples.filter((example: ContentData) => example.url !== '/examples/') as ContentData[])

onBeforeMount(() => {
  router.go(data.value?.[0].url)
})
</script>

<template>
  <div class="p-12">
    <div>
      <a
        v-for="example in data"
        :key="example.url"
        :href="example.url"
        class=""
      >
        {{ example.frontmatter.title }}
      </a>
    </div>
  </div>
</template>
