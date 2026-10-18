<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import InboxPanel from './inbox-panel.vue'

import { useInboxStore } from '../../../stores/inbox'

withDefaults(defineProps<{
  /** The side of the trigger where the card opens. @default 'bottom' */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** The card edge that lines up with the trigger. @default 'end' */
  align?: 'start' | 'center' | 'end'
}>(), { side: 'bottom', align: 'end' })

defineSlots<{
  /** The trigger. It receives the unread count and an accessible label for it. */
  default: (props: { unread: number, label: string, open: boolean }) => unknown
}>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const inbox = useInboxStore()
const { unread, messages, loading, error, hasMore, signedIn } = storeToRefs(inbox)
const now = useNow({ interval: 60_000 })
const label = computed(() => unread.value > 0
  ? t('stage.notifications.open-unread', { count: unread.value })
  : t('stage.notifications.open'))

// The list loads only when the user looks at it. The trigger uses the polled count.
watch(open, (value) => {
  if (value)
    void inbox.loadFirstPage()
})
// A sign-out removes the trigger, so an open card must not stay without it.
watch(signedIn, (value) => {
  if (!value)
    open.value = false
})
</script>

<template>
  <PopoverRoot v-if="signedIn" v-model:open="open">
    <PopoverTrigger as-child>
      <slot :unread="unread" :label="label" :open="open" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side" :align="align" :side-offset="8" :collision-padding="8"
        :class="[
          'z-50 w-108 max-w-[calc(100vw-1rem)] rounded-3xl outline-none',
          'border border-white/8 bg-neutral-900/86 shadow-xl backdrop-blur-xl',
        ]"
      >
        <InboxPanel
          :messages="messages" :now="now" :unread="unread" :loading="loading" :error="error" :has-more="hasMore"
          surface="island"
          @open="inbox.markRead" @read-all="inbox.markAllRead" @retry="inbox.loadFirstPage" @load-more="inbox.loadMore"
        />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
