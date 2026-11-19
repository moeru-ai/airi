<script setup lang="ts">
import type { InboxMessage } from './inbox-presentation'

import { Badge, GhostButton, IconButton, Skeleton } from '@proj-airi/ui'
import { useIntersectionObserver } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import InboxMessageItem from './inbox-message-item.vue'

import { formatAge, presentInboxMessages } from './inbox-presentation'

const props = withDefaults(defineProps<{
  messages: InboxMessage[]
  /** Reference time for message ages. Stories pass a fixed value. */
  now: Date
  /**
   * `floating` is a card over the stage: it pads its header and scrolls its own list.
   * `drawer` sits in a container that already pads and scrolls, such as a bottom drawer or a menu.
   * Both follow the light or dark theme. @default 'floating'
   */
  surface?: 'floating' | 'drawer'
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
}>(), { surface: 'floating', error: false, unread: undefined, loading: false, hasMore: false })

const emit = defineEmits<{
  open: [id: string]
  readAll: []
  retry: []
  loadMore: []
}>()

defineSlots<{
  /** Content before the title, for example a back button when the panel replaces a menu in place. */
  leading: () => unknown
}>()

const { t, locale } = useI18n()
const views = computed(() => presentInboxMessages(props.messages, t, locale.value))
const unread = computed(() => props.unread ?? views.value.filter(view => view.unread).length)

// The sentinel works for both surfaces: the floating card scrolls its list, and the drawer scrolls its body.
const listEnd = useTemplateRef<HTMLElement>('listEnd')
useIntersectionObserver(listEnd, ([entry]) => {
  if (entry?.isIntersecting && props.hasMore)
    emit('loadMore')
})
</script>

<template>
  <!-- Announcements have their own surface. This panel holds only the user's private messages. -->
  <section :class="['flex flex-col text-neutral-900 dark:text-neutral-100']" :aria-label="t('stage.notifications.title')">
    <header :class="['flex items-center gap-2', surface === 'floating' ? 'pl-5 pr-3 pt-3' : 'pt-1']">
      <slot name="leading" />
      <h2 :class="['flex flex-1 items-center gap-2 text-base font-semibold']">
        {{ t('stage.notifications.title') }}
        <Badge :count="unread" />
      </h2>
      <IconButton
        :disabled="unread === 0"
        :aria-label="t('stage.notifications.mark-all-read')" :title="t('stage.notifications.mark-all-read')"
        :class="[
          'size-8 rounded-full',
          'text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900',
          'dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-white',
          'focus-visible:outline-2 focus-visible:outline-primary-400',
        ]"
        @click="emit('readAll')"
      >
        <span aria-hidden="true" :class="['i-solar:check-read-linear size-5']" />
      </IconButton>
    </header>

    <div
      v-if="loading && views.length === 0"
      role="status" :aria-label="t('stage.notifications.loading')"
      :class="['flex flex-col gap-4 px-4 py-4']"
    >
      <div v-for="index in 3" :key="index" :class="['flex flex-col gap-2']">
        <Skeleton :class="['h-4 w-2/3 rounded-md']" />
        <Skeleton :class="['h-3 w-full rounded-md']" />
      </div>
    </div>
    <div
      v-else-if="error && views.length === 0"
      :class="['flex flex-col items-center gap-3 px-6 py-10 text-sm text-neutral-500 dark:text-neutral-400']"
    >
      <span aria-hidden="true" :class="['i-solar:cloud-cross-linear size-8']" />
      {{ t('stage.notifications.error') }}
      <GhostButton size="sm" :label="t('stage.notifications.retry')" @click="emit('retry')" />
    </div>
    <div
      v-else-if="views.length === 0"
      :class="['flex flex-col items-center gap-3 px-6 py-12 text-sm text-neutral-500 dark:text-neutral-400']"
    >
      <span aria-hidden="true" :class="['i-solar:inbox-line-linear size-8']" />
      {{ t('stage.notifications.empty') }}
    </div>
    <!-- A drawer or menu already scrolls its body, so only the floating card limits the list height. -->
    <ul v-else :class="['py-2', surface === 'floating' ? 'max-h-96 overflow-y-auto overscroll-contain px-2' : undefined]">
      <InboxMessageItem
        v-for="view in views" :key="view.id"
        :message="view" :age="formatAge(view.createdAt, now, locale, t)"
        @open="emit('open', view.id)"
      />
      <li v-if="hasMore" ref="listEnd" :class="['flex flex-col gap-2 px-4 py-3']" :aria-label="t('stage.notifications.loading')">
        <Skeleton :class="['h-4 w-1/2 rounded-md']" />
        <Skeleton :class="['h-3 w-5/6 rounded-md']" />
      </li>
    </ul>
  </section>
</template>
