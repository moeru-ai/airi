<script setup lang="ts">
import type { InboxMessage } from './inbox-presentation'

import { BasicButton, BottomDrawer, Button } from '@proj-airi/ui'
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
const drawerOpen = ref(false)
/** Copies the round button style of the real mobile header in stage-layouts. */
const headerButtonClass = [
  'size-11 shrink-0 rounded-full backdrop-blur-md',
  'bg-neutral-50/70 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300',
  'focus-visible:outline-2 focus-visible:outline-primary-500',
]
const unread = computed(() => messages.value.filter(message => message.readAt === '' && message.kind !== 'account.banned').length)

function markRead(id: string) {
  messages.value = messages.value.map(message => message.id === id && message.readAt === '' ? { ...message, readAt: now.toISOString() } : message)
}

function markAllRead() {
  messages.value = messages.value.map(message => ({ ...message, readAt: message.readAt || now.toISOString() }))
}

function reset() {
  messages.value = structuredClone(sortedMessages)
  drawerOpen.value = false
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

    <Variant id="mobile-entry" title="Mobile · header entry">
      <div :class="['inbox-story-stage relative mx-auto h-[780px] w-[390px] overflow-hidden']">
        <!--
          Mirrors MobileHeader in stage-layouts with its real buttons: conversations on the left,
          the character name in the middle, settings on the right. The bell joins the right group.
        -->
        <header :class="['absolute inset-x-0 top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center px-3 pt-3']">
          <div :class="['flex justify-start']">
            <BasicButton size="unset" :aria-label="t('stage.chat.sessions.title')" :class="headerButtonClass">
              <span aria-hidden="true" :class="['i-solar:dialog-2-outline size-6']" />
            </BasicButton>
          </div>
          <BasicButton size="unset" :class="['h-11 rounded-full px-3 text-neutral-700 dark:text-neutral-200']">
            <span :class="['text-base font-semibold']">AIRI</span>
            <span aria-hidden="true" :class="['i-solar:alt-arrow-down-outline size-4']" />
          </BasicButton>
          <div :class="['flex justify-end gap-2']">
            <div :class="['relative']">
              <BasicButton
                size="unset" :class="headerButtonClass"
                :aria-label="unread ? t('stage.notifications.open-unread', { count: unread }) : t('stage.notifications.open')"
                @click="drawerOpen = true"
              >
                <span aria-hidden="true" :class="['i-solar:bell-outline size-6']" />
              </BasicButton>
              <span
                v-if="unread"
                aria-hidden="true"
                :class="['pointer-events-none absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-primary-500 px-1 text-center text-xs text-white font-medium leading-5 ring-2 ring-white/80 dark:ring-neutral-900/80']"
              >
                {{ unread > 9 ? '9+' : unread }}
              </span>
            </div>
            <BasicButton size="unset" :aria-label="t('stage.mobile-tools.title')" :class="headerButtonClass">
              <span aria-hidden="true" :class="['i-solar:settings-outline size-6']" />
            </BasicButton>
          </div>
        </header>
        <!-- A stand-in for the composer, so the header reads at its real position on the screen. -->
        <div :class="['absolute inset-x-3 bottom-4 flex items-center gap-2 rounded-full bg-neutral-50/80 px-4 py-3 text-sm text-neutral-400 backdrop-blur-md dark:bg-neutral-900/80']">
          <span :class="['flex-1']">Aa</span>
          <span aria-hidden="true" :class="['i-solar:soundwave-linear size-5']" />
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
