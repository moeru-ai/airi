<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { watch } from 'vue'

import InboxPanel from './inbox-panel.vue'

import { useInboxStore } from '../../../stores/inbox'

withDefaults(defineProps<{
  /** The side of the anchor where the card opens. @default 'bottom' */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** The card edge that lines up with the anchor. @default 'end' */
  align?: 'start' | 'center' | 'end'
}>(), { side: 'bottom', align: 'end' })

defineSlots<{
  /** The anchor. The caller owns the control that opens the card, for example an account menu item. */
  default: () => unknown
}>()

/** The caller opens the card from its own control. A click outside the card closes it. */
const open = defineModel<boolean>('open', { default: false })

const inbox = useInboxStore()
const { unread, messages, loading, error, hasMore, signedIn } = storeToRefs(inbox)
const now = useNow({ interval: 60_000 })

// The list loads only when the user looks at it. The anchor uses the polled count.
watch(open, (value) => {
  if (value)
    void inbox.loadFirstPage()
})
watch(signedIn, (value) => {
  if (!value)
    open.value = false
})

// NOTICE:
// The account menu closes and returns focus to its trigger, outside this card.
// A non-modal popover closes on focus outside, so the card would close at once.
// Source: reka-ui DropdownMenuContent close auto focus and PopoverContent focusOutside.
// Remove when the card has its own trigger. A click outside still closes it.
function keepOpenOnFocusOutside(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverAnchor as-child>
      <slot />
    </PopoverAnchor>
    <PopoverPortal v-if="signedIn">
      <PopoverContent
        :side="side" :align="align" :side-offset="8" :collision-padding="8"
        :class="[
          'z-50 w-108 max-w-[calc(100vw-1rem)] rounded-2xl outline-none shadow-lg backdrop-blur-md',
          // The same theme-aware surface as the blurry DropdownMenu that opens this card.
          'border border-neutral-100/80 bg-neutral-100/90 dark:border-neutral-800/60 dark:bg-neutral-800/90',
        ]"
        @focus-outside="keepOpenOnFocusOutside"
      >
        <InboxPanel
          :messages="messages" :now="now" :unread="unread" :loading="loading" :error="error" :has-more="hasMore"
          surface="floating"
          @open="inbox.markRead" @read-all="inbox.markAllRead" @retry="inbox.loadFirstPage" @load-more="inbox.loadMore"
        />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
