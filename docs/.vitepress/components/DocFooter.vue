<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useData } from 'vitepress'
import { computed } from 'vue'

import { useEditLink } from '../composables/edit-link'
import { usePrevNext } from '../composables/prev-next'
import DocFooterLastUpdated from './DocFooterLastUpdated.vue'

const { theme, page, frontmatter } = useData()

const editLink = useEditLink()
const control = usePrevNext()

const hasEditLink = computed(
  () => theme.value.editLink && frontmatter.value.editLink !== false,
)
const hasLastUpdated = computed(() => page.value.lastUpdated)
const showFooter = computed(
  () =>
    hasEditLink.value
    || hasLastUpdated.value
    || control.value.prev
    || control.value.next,
)
</script>

<template>
  <footer
    v-if="showFooter"
    class="my-28"
  >
    <div
      v-if="hasEditLink || hasLastUpdated"
      class="text-muted-foreground flex justify-between"
    >
      <div
        v-if="hasEditLink"
        class="text-muted-foreground hover:text-foreground text-sm"
      >
        <a
          :href="editLink.url"
          target="_blank"
          class="inline-flex items-center gap-2"
        >
          <Icon icon="lucide:pencil-line" />
          {{ editLink.text }}
        </a>
      </div>

      <div
        v-if="hasLastUpdated"
        class="text-sm"
      >
        <DocFooterLastUpdated />
      </div>
    </div>

    <nav
      v-if="control.prev?.link || control.next?.link"
      class="mt-8 flex flex-col items-center justify-between gap-4 md:flex-row"
      aria-labelledby="doc-footer-aria-label"
    >
      <span
        id="doc-footer-aria-label"
        class="sr-only"
      >
        Pager
      </span>

      <div class="group w-full">
        <a
          v-if="control.prev?.link"
          class="border-muted w-full inline-flex flex-col border rounded-lg bg-transparent px-4 py-6 hover:border-primary"
          :href="control.prev.link"
        >
          <span
            class="text-muted-foreground group-hover:text-foreground text-xs"
            v-html="theme.docFooter?.prev || 'Previous page'"
          />
          <p class="mt-2 inline-flex items-center gap-1">
            <Icon icon="lucide:arrow-left" />
            <span
              class="text-sm font-semibold"
              v-html="control.prev.text"
            />
          </p>
        </a>
      </div>
      <div class="group w-full">
        <a
          v-if="control.next?.link"
          class="border-muted w-full inline-flex flex-col items-end border rounded-lg bg-transparent px-4 py-6 hover:border-primary"
          :href="control.next.link"
        >
          <span
            class="text-muted-foreground group-hover:text-foreground text-xs"
            v-html="theme.docFooter?.next || 'Next page'"
          />

          <p class="mt-2 inline-flex items-center gap-1">
            <span
              class="text-sm font-semibold"
              v-html="control.next.text"
            />
            <Icon icon="lucide:arrow-right" />
          </p>
        </a>
      </div>
    </nav>
  </footer>
</template>
