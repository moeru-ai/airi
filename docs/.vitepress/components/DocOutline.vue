<script setup lang="ts">
import { onContentUpdated, useData } from 'vitepress'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import DocOutlineItem from '../components/DocOutlineItem.vue'

import { getHeaders, useActiveAnchor } from '../composables/outline'

defineProps<{
  collapsible?: boolean
}>()

const { page, frontmatter, theme } = useData()
const { t } = useI18n()

onContentUpdated(() => {
  getHeaders(frontmatter.value.outline ?? theme.value.outline)
})

const container = ref()
const marker = ref()

useActiveAnchor(container, marker)
</script>

<template>
  <nav
    ref="container"
    class="not-prose relative block"
  >
    <div
      ref="marker"
      class="outline-marker absolute left-0 h-[18px] w-[2px] rounded-full bg-primary transition-[top,opacity] duration-300 ease-in-out -translate-y-1"
    />

    <div
      v-if="!collapsible"
      id="doc-outline-aria-label"
      aria-level="2"
      class="trunc mb-2 text-sm font-bold"
      role="heading"
    >
      {{ t('docs.theme.doc.outline.title') }}
    </div>

    <div class="border-muted border-l font-sans">
      <DocOutlineItem
        :headers="page.headers"
        :root="true"
      />
    </div>
  </nav>
</template>
