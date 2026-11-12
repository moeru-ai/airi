<script setup lang="ts">
import { InboxPanel } from '@proj-airi/stage-ui/components'
import { useInboxStore } from '@proj-airi/stage-ui/stores/inbox'
import { useEventListener, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const inbox = useInboxStore()
const { unread, messages, loading, error, hasMore, signedIn } = storeToRefs(inbox)
const now = useNow({ interval: 60_000 })

watch(signedIn, (value) => {
  if (value)
    void inbox.loadFirstPage()
}, { immediate: true })

useEventListener(window, 'focus', () => void inbox.loadFirstPage())
</script>

<template>
  <InboxPanel
    v-if="signedIn"
    :messages="messages" :now="now" :unread="unread"
    :loading="loading" :error="error" :has-more="hasMore"
    surface="drawer"
    @open="inbox.markRead" @read-all="inbox.markAllRead" @retry="inbox.loadFirstPage" @load-more="inbox.loadMore"
  />
  <p v-else :class="['px-4 py-6 text-sm text-neutral-600 dark:text-neutral-300']">
    {{ t('settings.pages.account.notLoggedIn') }}
  </p>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: stage.notifications.title
  subtitleKey: settings.title
  icon: i-solar:bell-outline
  settingsEntry: false
</route>
