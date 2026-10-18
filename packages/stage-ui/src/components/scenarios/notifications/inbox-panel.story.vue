<script setup lang="ts">
import type { InboxMessage } from './inbox-presentation'

import { BottomDrawer, Button } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import InboxPanel from './inbox-panel.vue'

const { t } = useI18n()
const now = new Date('2026-10-18T10:00:00Z')

/** Covers every first kind, a read message, and one unknown kind that the panel must skip. */
const initialMessages: InboxMessage[] = [
  { id: 'm1', kind: 'subscription.payment_failed', params: { plan: 'Pro', retryAt: '2026-10-20T00:00:00Z' }, readAt: '', createdAt: '2026-10-18T08:12:00Z' },
  { id: 'm2', kind: 'flux.granted', params: { amount: 500, reason: '感谢参与 AIRI 首发测试，这是给你的小礼物。' }, readAt: '', createdAt: '2026-10-18T09:59:30Z' },
  { id: 'm3', kind: 'account.banned', params: {}, readAt: '', createdAt: '2026-10-18T09:00:00Z' },
  { id: 'm4', kind: 'subscription.renewed', params: { plan: 'Pro', periodEnd: '2026-11-14T00:00:00Z' }, readAt: '2026-10-15T00:00:00Z', createdAt: '2026-10-14T23:10:00Z' },
  { id: 'm5', kind: 'flux.granted', params: { amount: 1200, reason: 'Bug bounty: thanks for the Live2D import report.' }, readAt: '2026-10-02T00:00:00Z', createdAt: '2026-10-01T12:00:00Z' },
]
const sortedMessages = [...initialMessages].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

const messages = ref(structuredClone(sortedMessages))
const readMessages = sortedMessages.map(message => ({ ...message, readAt: message.readAt || '2026-10-18T09:00:00Z' }))
const drawerOpen = ref(true)
const unread = computed(() => messages.value.filter(message => message.readAt === '' && message.kind !== 'account.banned').length)

function markRead(id: string) {
  messages.value = messages.value.map(message => message.id === id && message.readAt === '' ? { ...message, readAt: now.toISOString() } : message)
}

function markAllRead() {
  messages.value = messages.value.map(message => ({ ...message, readAt: message.readAt || now.toISOString() }))
}

function reset() {
  messages.value = structuredClone(sortedMessages)
}
</script>

<template>
  <Story title="Inbox Panel" group="widgets" :layout="{ type: 'single', iframe: true }">
    <template #controls>
      <ThemeColorsHueControl />
      <Button size="sm" label="Reset unread" @click="reset" />
    </template>

    <Variant id="desktop-unread" title="Desktop · unread messages">
      <div :class="['inbox-story-stage relative h-[640px] w-full overflow-hidden']">
        <div :class="['absolute bottom-10 left-6 flex flex-col items-start gap-3']">
          <div :class="['w-108 rounded-3xl border border-white/8 bg-neutral-900/86 shadow-xl backdrop-blur-xl']">
            <InboxPanel :messages="messages" :now="now" @open="markRead" @read-all="markAllRead" />
          </div>
          <div :class="['relative']">
            <Button
              icon="i-solar:bell-outline" shape="circle"
              :aria-label="unread ? t('stage.notifications.open-unread', { count: unread }) : t('stage.notifications.open')"
            />
            <span
              v-if="unread"
              :class="['absolute -right-1 -top-1 min-w-5 rounded-full bg-primary-500 px-1 text-center text-xs text-white leading-5 ring-2 ring-white dark:ring-neutral-900']"
            >
              {{ unread > 9 ? '9+' : unread }}
            </span>
          </div>
        </div>
      </div>
    </Variant>

    <Variant id="desktop-all-read" title="Desktop · all read">
      <div :class="['inbox-story-stage relative h-[560px] w-full overflow-hidden']">
        <div :class="['absolute bottom-10 left-6 w-108 rounded-3xl border border-white/8 bg-neutral-900/86 shadow-xl backdrop-blur-xl']">
          <InboxPanel :messages="readMessages" :now="now" />
        </div>
      </div>
    </Variant>

    <Variant id="desktop-empty" title="Desktop · empty inbox">
      <div :class="['inbox-story-stage relative h-[420px] w-full overflow-hidden']">
        <div :class="['absolute bottom-10 left-6 w-108 rounded-3xl border border-white/8 bg-neutral-900/86 shadow-xl backdrop-blur-xl']">
          <InboxPanel :messages="[]" :now="now" />
        </div>
      </div>
    </Variant>

    <Variant id="desktop-error" title="Desktop · load failure">
      <div :class="['inbox-story-stage relative h-[420px] w-full overflow-hidden']">
        <div :class="['absolute bottom-10 left-6 w-108 rounded-3xl border border-white/8 bg-neutral-900/86 shadow-xl backdrop-blur-xl']">
          <InboxPanel :messages="[]" :now="now" error />
        </div>
      </div>
    </Variant>

    <Variant id="mobile-drawer" title="Mobile · bottom drawer">
      <div :class="['inbox-story-stage relative mx-auto h-[780px] w-[390px] overflow-hidden']">
        <div :class="['absolute right-3 top-3']">
          <Button icon="i-solar:bell-outline" shape="circle" :aria-label="t('stage.notifications.open')" @click="drawerOpen = true" />
        </div>
        <!-- The panel header names the drawer and holds mark-all-read, so the drawer hides its own title. -->
        <BottomDrawer v-model="drawerOpen" :title="t('stage.notifications.title')" minimum-height="half" hide-title>
          <InboxPanel :messages="messages" :now="now" surface="drawer" @open="markRead" @read-all="markAllRead" />
        </BottomDrawer>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
/* Stands in for the character stage, so translucent cards can be judged against a bright, busy background. */
.inbox-story-stage {
  background:
    radial-gradient(circle at 70% 35%, rgb(255 214 232 / 0.95), transparent 45%),
    radial-gradient(circle at 25% 70%, rgb(186 220 255 / 0.9), transparent 50%),
    linear-gradient(160deg, #fef6fb, #e8f1ff 60%, #f6efff);
}
</style>
