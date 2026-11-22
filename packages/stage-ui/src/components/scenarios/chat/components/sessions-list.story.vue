<script setup lang="ts">
import type { ChatSessionFolder, ChatSessionMeta, ChatSessionsPlace } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { ref } from 'vue'

import ChatArchivedSessionCallout from './archived-session-callout.vue'
import SessionRowItem from './session-row.vue'
import SessionsList from './sessions-list.vue'

/** A fixed instant, so every render of the story shows the same data. */
const CREATED_AT = 1_700_000_000_000

const folders: ChatSessionFolder[] = [
  { id: 'trips', name: 'Trips', createdAt: CREATED_AT },
  { id: 'work', name: 'Work', createdAt: CREATED_AT + 1 },
]

const characters = [
  { id: 'airi', name: 'AIRI' },
  { id: 'mira', name: 'Mira' },
  { id: 'nova', name: 'Nova' },
]

function rowOf(sessionId: string, title: string, characterId: string, details: Partial<ChatSessionMeta> & { label: string, isActive?: boolean }): SessionRow {
  const { label, isActive = false, ...meta } = details
  return {
    meta: { sessionId, userId: 'local', characterId, title, createdAt: CREATED_AT, updatedAt: CREATED_AT, ...meta },
    preview: title,
    isActive,
    activityAtLabel: label,
    characterName: characters.find(character => character.id === characterId)?.name ?? 'Unknown character',
  }
}

const rows: SessionRow[] = [
  rowOf('weekend', 'Weekend trip ideas', 'airi', { label: '2 minutes ago', isActive: true, folderId: 'trips' }),
  rowOf('book', 'Notes on the new book', 'airi', { label: '1 hour ago', pinnedAt: CREATED_AT }),
  rowOf('review', 'Review a pull request', 'mira', { label: '3 hours ago', folderId: 'work', cloudChatId: 'cloud-review' }),
  rowOf('bug', 'Draft a bug report', 'mira', { label: 'yesterday', folderId: 'work' }),
  rowOf('groceries', 'Grocery list for the week', 'airi', { label: '2 days ago' }),
  rowOf('intro', 'Practice a self-introduction', 'mira', { label: 'last week', archivedAt: CREATED_AT }),
]

const popoverPlace = ref<ChatSessionsPlace>({ kind: 'all' })
const drawerPlace = ref<ChatSessionsPlace>({ kind: 'all' })
const folderPlace = ref<ChatSessionsPlace>({ kind: 'folder', folderId: 'work' })
const archivePlace = ref<ChatSessionsPlace>({ kind: 'archive' })
const emptyPlace = ref<ChatSessionsPlace>({ kind: 'all' })
const filteredCharacter = ref<string | undefined>('mira')
</script>

<template>
  <Story title="Conversation List" group="chat">
    <Variant id="popover" title="Popover">
      <div :class="['w-88 rounded-xl bg-white p-2 dark:bg-neutral-900']">
        <SessionsList v-model:place="popoverPlace" compact :rows="rows" :characters="characters" :folders="folders" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="drawer" title="Drawer">
      <div :class="['max-w-lg bg-neutral-50 p-5 dark:bg-neutral-900']">
        <SessionsList v-model:place="drawerPlace" :rows="rows" :characters="characters" :folders="folders" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="folder-and-character" title="Folder with a character filter">
      <div :class="['max-w-lg bg-neutral-50 p-5 dark:bg-neutral-900']">
        <SessionsList v-model:place="folderPlace" v-model:character-id="filteredCharacter" :rows="rows" :characters="characters" :folders="folders" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="archive" title="Archive">
      <div :class="['max-w-lg bg-neutral-50 p-5 dark:bg-neutral-900']">
        <SessionsList v-model:place="archivePlace" :rows="rows" :characters="characters" :folders="folders" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="empty" title="No conversations">
      <div :class="['max-w-lg bg-neutral-50 p-5 dark:bg-neutral-900']">
        <SessionsList v-model:place="emptyPlace" :rows="[]" :characters="characters" :folders="[]" :is-creating-session="false" />
      </div>
    </Variant>
    <Variant id="row-states" title="Row states">
      <div :class="['flex w-88 flex-col gap-1 rounded-xl bg-white p-2 dark:bg-neutral-900']">
        <SessionRowItem :row="rows[0]!" :folders="folders" compact :selecting="false" :selected="false" show-folder :confirming-delete="false" />
        <SessionRowItem :row="rows[1]!" :folders="folders" compact :selecting="false" :selected="false" show-folder confirming-delete />
        <SessionRowItem :row="rows[2]!" :folders="folders" compact selecting selected show-folder :confirming-delete="false" />
        <SessionRowItem :row="rows[3]!" :folders="folders" compact selecting :selected="false" show-folder :confirming-delete="false" />
      </div>
    </Variant>
    <Variant id="archived-callout" title="Archived conversation callout">
      <div :class="['max-w-lg p-4']">
        <ChatArchivedSessionCallout />
      </div>
    </Variant>
  </Story>
</template>
