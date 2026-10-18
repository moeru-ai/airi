<script setup lang="ts">
import type { InboxMessage } from './inbox-presentation'

import { useIntersectionObserver } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import InboxMessageItem from './inbox-message-item.vue'

import { formatAge, formatUnreadBadge, presentInboxMessages } from './inbox-presentation'

const props = withDefaults(defineProps<{
  messages: InboxMessage[]
  /** Reference time for message ages. Stories pass a fixed value. */
  now: Date
  /** `island` is the floating card on desktop. `drawer` is the mobile bottom drawer body. @default 'island' */
  surface?: 'island' | 'drawer'
  error?: boolean
  /**
   * The server unread count, which also counts messages on later pages. Without it, the header
   * counts the unread messages in `messages`.
   */
  unread?: number
  /** The first page is loading. The panel shows a spinner instead of the empty state. */
  loading?: boolean
  /** More pages exist. The panel emits `loadMore` when the end of the list scrolls into view. */
  hasMore?: boolean
}>(), { surface: 'island', error: false, unread: undefined, loading: false, hasMore: false })

const emit = defineEmits<{
  open: [id: string]
  readAll: []
  retry: []
  loadMore: []
}>()

const { t, locale } = useI18n()
const views = computed(() => presentInboxMessages(props.messages, t, locale.value))
const unread = computed(() => props.unread ?? views.value.filter(view => view.unread).length)

// The sentinel works for both surfaces: the island card scrolls its list, and the drawer scrolls its body.
const listEnd = useTemplateRef<HTMLElement>('listEnd')
useIntersectionObserver(listEnd, ([entry]) => {
  if (entry?.isIntersecting && props.hasMore)
    emit('loadMore')
})

const tone = computed(() => props.surface === 'island'
  ? { title: 'text-white', muted: 'text-white/55', control: 'text-white/70 hover:text-white hover:bg-white/6' }
  : { title: 'text-neutral-900 dark:text-white', muted: 'text-neutral-500 dark:text-neutral-400', control: 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-800' })
</script>

<template>
  <!-- Announcements have their own surface. This panel holds only the user's private messages. -->
  <section :class="['flex flex-col']" :aria-label="t('stage.notifications.title')">
    <header :class="['flex items-center gap-2', surface === 'island' ? 'pl-5 pr-3 pt-3' : 'pt-1']">
      <h2 :class="['flex flex-1 items-center gap-2 text-base font-semibold', tone.title]">
        {{ t('stage.notifications.title') }}
        <span
          v-if="unread > 0"
          :class="['min-w-5 rounded-full bg-primary-500 px-1.5 text-center text-xs text-white font-medium leading-5']"
        >
          {{ formatUnreadBadge(unread) }}
        </span>
      </h2>
      <button
        type="button" :disabled="unread === 0"
        :aria-label="t('stage.notifications.mark-all-read')" :title="t('stage.notifications.mark-all-read')"
        :class="[
          'size-8 shrink-0 flex items-center justify-center rounded-full outline-none',
          'transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-primary-400',
          'disabled:opacity-40 disabled:pointer-events-none',
          tone.control,
        ]"
        @click="emit('readAll')"
      >
        <span :class="['i-solar:check-read-linear size-5']" />
      </button>
    </header>

    <div
      v-if="loading && views.length === 0"
      role="status" :aria-label="t('stage.notifications.loading')"
      :class="['flex justify-center px-6 py-12', tone.muted]"
    >
      <span :class="['i-svg-spinners:ring-resize size-6']" />
    </div>
    <div v-else-if="error && views.length === 0" :class="['flex flex-col items-center gap-3 px-6 py-10 text-sm', tone.muted]">
      <span :class="['i-solar:cloud-cross-linear size-8']" />
      {{ t('stage.notifications.error') }}
      <button
        type="button"
        :class="['rounded-full px-3 py-1 text-xs outline-none focus-visible:outline-2 focus-visible:outline-primary-400', tone.control]"
        @click="emit('retry')"
      >
        {{ t('stage.notifications.retry') }}
      </button>
    </div>
    <div v-else-if="views.length === 0" :class="['flex flex-col items-center gap-3 px-6 py-12 text-sm', tone.muted]">
      <span :class="['i-solar:inbox-line-linear size-8']" />
      {{ t('stage.notifications.empty') }}
    </div>
    <!-- The drawer already scrolls its body, so only the floating card limits the list height. -->
    <ul v-else :class="['py-2', surface === 'island' ? 'max-h-96 overflow-y-auto overscroll-contain px-2' : undefined]">
      <InboxMessageItem
        v-for="view in views" :key="view.id"
        :message="view" :age="formatAge(view.createdAt, now, locale, t)" :surface="surface"
        @open="emit('open', view.id)"
      />
      <li v-if="hasMore" ref="listEnd" :class="['flex justify-center py-2', tone.muted]">
        <span :class="['i-svg-spinners:ring-resize size-4']" />
      </li>
    </ul>
  </section>
</template>
