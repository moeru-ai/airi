<script setup lang="ts">
import type { ChatSessionFolder } from '../../../../types/chat-session'

import { MenuItem, MenuSeparator } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import SessionMenuNewFolder from './session-menu-new-folder.vue'

/** The targets of Move to folder, for one conversation or a selection. */
const props = defineProps<{
  folders: readonly ChatSessionFolder[]
  /** The folder that every conversation is in. It shows a check and takes no move. */
  currentFolderId?: string
  /** Whether any of the conversations is in a folder. No folder is then available, also when the folders differ. */
  inFolder: boolean
}>()

const emit = defineEmits<{
  /** `undefined` moves the conversations out of their folder. */
  move: [folderId: string | undefined]
  /** Creates a folder with this name, then moves the conversations into it. */
  create: [name: string]
}>()

const { t } = useI18n()
</script>

<template>
  <MenuItem
    v-for="folder in props.folders"
    :key="folder.id"
    :disabled="folder.id === props.currentFolderId"
    @select="emit('move', folder.id)"
  >
    <span aria-hidden="true" :class="['i-mingcute:folder-line size-4 shrink-0']" />
    <span :class="['min-w-0 flex-1 truncate']">{{ folder.name }}</span>
    <span v-if="folder.id === props.currentFolderId" aria-hidden="true" :class="['i-mingcute:check-line size-4 shrink-0 text-primary-500']" />
  </MenuItem>
  <MenuItem v-if="props.inFolder" @select="emit('move', undefined)">
    <span aria-hidden="true" :class="['i-mingcute:folder-minus-line size-4 shrink-0']" />
    {{ t('stage.chat.sessions.no-folder') }}
  </MenuItem>
  <MenuSeparator v-if="props.folders.length > 0 || props.inFolder" />
  <SessionMenuNewFolder @create="emit('create', $event)" />
</template>
