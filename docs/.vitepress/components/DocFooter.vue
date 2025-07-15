<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useData } from 'vitepress'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DocFooterLastUpdated from './DocFooterLastUpdated.vue'

import { useEditLink } from '../composables/edit-link'
import { usePrevNext } from '../composables/prev-next'

const { theme, page, frontmatter } = useData()
const { t } = useI18n()

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
  <!-- eslint-disable vue/prefer-separate-static-class -->
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
        transition-colors duration-200 ease-in-out
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
          class="w-full inline-flex flex-col items-end rounded-lg px-4 py-6 backdrop-blur-md"
          :class="[
            'shadow-md shadow-transparent dark:shadow-none hover:shadow-black/5',
            'border-2 border-neutral-200/40 border-solid dark:border-2 dark:border-neutral-800/40 dark:border-solid',
            'bg-white/30 dark:bg-neutral-800/30 hover:bg-white/50 dark:hover:bg-neutral-800/50',
            'active:scale-98',
            'transition-all duration-200 ease-in-out',
          ]"
          :href="control.prev.link"
        >
          <span
            class="text-muted-foreground group-hover:text-foreground text-xs transition-all duration-200 ease-in-out"
            v-html="theme.docFooter?.prev || t('docs.theme.doc.previous-page.title')"
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
          class="w-full inline-flex flex-col items-end rounded-lg px-4 py-6 backdrop-blur-md"
          :class="[
            'shadow-md shadow-transparent dark:shadow-none hover:shadow-black/5',
            'border-2 border-neutral-200/40 border-solid dark:border-2 dark:border-neutral-800/40 dark:border-solid',
            'bg-white/30 dark:bg-neutral-800/30 hover:bg-white/50 dark:hover:bg-neutral-800/50',
            'active:scale-98',
            'transition-all duration-200 ease-in-out',
          ]"
          :href="control.next.link"
        >
          <span
            class="text-muted-foreground group-hover:text-foreground text-xs transition-all duration-200 ease-in-out"
            v-html="theme.docFooter?.next || t('docs.theme.doc.next-page.title')"
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
