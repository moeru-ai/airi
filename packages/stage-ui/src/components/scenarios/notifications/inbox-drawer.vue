<script setup lang="ts">
import { BasicButton, BottomDrawer } from '@proj-airi/ui'
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import InboxPanel from './inbox-panel.vue'

import { useInboxStore } from '../../../stores/inbox'
import { formatUnreadBadge } from './inbox-presentation'

const { t } = useI18n()
const inbox = useInboxStore()
const { unread, messages, loading, error, hasMore, signedIn } = storeToRefs(inbox)
const open = ref(false)
const now = useNow({ interval: 60_000 })
const label = computed(() => unread.value > 0
  ? t('stage.notifications.open-unread', { count: unread.value })
  : t('stage.notifications.open'))

// The list loads only when the user looks at it. The badge uses the polled count.
watch(open, (value) => {
  if (value)
    void inbox.loadFirstPage()
})
// A sign-out removes the trigger, so an open drawer must not stay without it.
watch(signedIn, (value) => {
  if (!value)
    open.value = false
})
</script>

<template>
  <!-- The panel header names the drawer and holds mark-all-read, so the drawer hides its own title. -->
  <BottomDrawer v-if="signedIn" v-model="open" :title="t('stage.notifications.title')" minimum-height="half" hide-title>
    <template #trigger>
      <BasicButton
        size="unset"
        data-testid="notifications-button"
        :aria-label="label" :title="t('stage.notifications.title')"
        :class="[
          'pointer-events-auto relative size-11 shrink-0 rounded-full backdrop-blur-md',
          'bg-neutral-50/70 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300',
          'focus-visible:outline-2 focus-visible:outline-primary-500',
        ]"
      >
        <span aria-hidden="true" :class="['i-solar:bell-outline size-6']" />
        <span
          v-if="unread > 0"
          aria-hidden="true"
          :class="[
            'pointer-events-none absolute -right-0.5 -top-0.5 min-w-5 rounded-full px-1',
            'bg-primary-500 text-center text-xs text-white font-medium leading-5',
            'ring-2 ring-white/80 dark:ring-neutral-900/80',
          ]"
        >
          {{ formatUnreadBadge(unread) }}
        </span>
      </BasicButton>
    </template>
    <InboxPanel
      :messages="messages" :now="now" :unread="unread" :loading="loading" :error="error" :has-more="hasMore"
      surface="drawer"
      @open="inbox.markRead" @read-all="inbox.markAllRead" @retry="inbox.loadFirstPage" @load-more="inbox.loadMore"
    />
  </BottomDrawer>
</template>
