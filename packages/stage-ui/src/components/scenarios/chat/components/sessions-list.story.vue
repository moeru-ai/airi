<script setup lang="ts">
import type { ChatSessionMeta, ChatSessionsPlace } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { ref } from 'vue'

import ChatArchivedSessionCallout from './archived-session-callout.vue'
import SessionRowItem from './session-row.vue'
import SessionsList from './sessions-list.vue'

/** A fixed instant, so every render of the story shows the same data. */
const CREATED_AT = 1_700_000_000_000

function rowOf(sessionId: string, title: string, details: Partial<ChatSessionMeta> & { label: string, isActive?: boolean }): SessionRow {
  const { label, isActive = false, ...meta } = details
  return {
    meta: { sessionId, userId: 'local', characterId: 'airi', title, createdAt: CREATED_AT, updatedAt: CREATED_AT, ...meta },
    preview: title,
    isActive,
    activityAtLabel: label,
    characterName: 'AIRI',
  }
}

const rows: SessionRow[] = [
  rowOf('weekend', 'Weekend trip ideas', { label: '2 minutes ago', isActive: true }),
  rowOf('book', 'Notes on the new book', { label: '1 hour ago', pinnedAt: CREATED_AT }),
  rowOf('review', 'Review a pull request', { label: '3 hours ago', cloudChatId: 'cloud-review' }),
  rowOf('bug', 'Draft a bug report', { label: 'yesterday' }),
  rowOf('groceries', 'Grocery list for the week', { label: '2 days ago' }),
  rowOf('intro', 'Practice a self-introduction', { label: 'last week', archivedAt: CREATED_AT }),
]

const popoverPlace = ref<ChatSessionsPlace>({ kind: 'all' })
const drawerPlace = ref<ChatSessionsPlace>({ kind: 'all' })
const archivePlace = ref<ChatSessionsPlace>({ kind: 'archive' })
const emptyPlace = ref<ChatSessionsPlace>({ kind: 'all' })
</script>

<template>
  <Story title="Conversation List" group="chat">
    <Variant id="popover" title="Popover">
      <div :class="['w-88 rounded-xl bg-white p-2 dark:bg-neutral-900']">
        <SessionsList v-model:place="popoverPlace" compact :rows="rows" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="drawer" title="Drawer">
      <div :class="['max-w-lg bg-neutral-50 p-5 dark:bg-neutral-900']">
        <SessionsList v-model:place="drawerPlace" :rows="rows" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="archive" title="Archive">
      <div :class="['max-w-lg bg-neutral-50 p-5 dark:bg-neutral-900']">
        <SessionsList v-model:place="archivePlace" :rows="rows" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="empty" title="No conversations">
      <div :class="['max-w-lg bg-neutral-50 p-5 dark:bg-neutral-900']">
        <SessionsList v-model:place="emptyPlace" :rows="[]" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="row-states" title="Row states">
      <div :class="['flex w-88 flex-col gap-1 rounded-xl bg-white p-2 dark:bg-neutral-900']">
        <SessionRowItem :row="rows[0]!" compact :selecting="false" :selected="false" />
        <SessionRowItem :row="rows[1]!" compact :selecting="false" :selected="false" />
        <SessionRowItem :row="rows[2]!" compact selecting selected />
        <SessionRowItem :row="rows[3]!" compact selecting :selected="false" />
      </div>
    </Variant>
    <Variant id="archived-callout" title="Archived conversation callout">
      <div :class="['max-w-lg p-4']">
        <ChatArchivedSessionCallout />
      </div>
    </Variant>
  </Story>
</template>
