<script setup lang="ts">
import { BottomDrawer, IconButton } from '@proj-airi/ui'
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

import InboxPanel from './inbox-panel.vue'

import { useInboxStore } from '../../../stores/inbox'

const emit = defineEmits<{
  /** The user asked to return to the menu that opened this drawer. */
  back: []
  /** The close animation finished. A caller can open the next modal now. */
  afterClose: []
}>()

/** The mobile menu opens this drawer after its own drawer closes, so focus and scroll locks have one owner. */
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const inbox = useInboxStore()
const { unread, messages, loading, error, hasMore, signedIn } = storeToRefs(inbox)
const now = useNow({ interval: 60_000 })

// The list loads only when the user looks at it. The menu badge uses the polled count.
watch(open, (value) => {
  if (value)
    void inbox.loadFirstPage()
})
// A sign-out removes the menu entry, so an open drawer must not stay without it.
watch(signedIn, (value) => {
  if (!value)
    open.value = false
})
</script>

<template>
  <!-- The panel header names the drawer and holds mark-all-read, so the drawer hides its own title. -->
  <BottomDrawer v-model="open" :title="t('stage.notifications.title')" minimum-height="half" hide-title @after-close="emit('afterClose')">
    <InboxPanel
      :messages="messages" :now="now" :unread="unread" :loading="loading" :error="error" :has-more="hasMore"
      surface="drawer"
      @open="inbox.markRead" @read-all="inbox.markAllRead" @retry="inbox.loadFirstPage" @load-more="inbox.loadMore"
    >
      <template #leading>
        <IconButton
          data-testid="notifications-back"
          :aria-label="t('stage.notifications.back')" :title="t('stage.notifications.back')"
          :class="[
            '-ml-2 size-8 rounded-full outline-none',
            'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
            'dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white',
            'focus-visible:outline-2 focus-visible:outline-primary-400',
          ]"
          @click="emit('back')"
        >
          <span aria-hidden="true" :class="['i-solar:alt-arrow-left-linear size-5']" />
        </IconButton>
      </template>
    </InboxPanel>
  </BottomDrawer>
</template>
