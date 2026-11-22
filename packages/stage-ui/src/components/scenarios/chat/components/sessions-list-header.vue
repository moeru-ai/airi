<script setup lang="ts">
import type { ChatSessionFolder, ChatSessionsPlace } from '../../../../types/chat-session'

import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator } from '@proj-airi/ui'
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionDeleteButton from './session-delete-button.vue'
import SessionMenuNewFolder from './session-menu-new-folder.vue'
import SessionNameField from './session-name-field.vue'

import { useMenuCloseAction } from '../composables/use-menu-close-action'
import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

/**
 * The title of the conversation list. It names the place that the list shows and switches it: all conversations, a
 * folder, or the archive. A folder adds its delete button and its menu, which renames the folder in place of the title.
 */
const props = defineProps<{
  /** The place that the list shows. */
  place: ChatSessionsPlace
  folders: readonly ChatSessionFolder[]
  /** The folder that the list shows. */
  currentFolder?: ChatSessionFolder
  /** The number of conversations that are not archived. */
  liveCount: number
  archivedCount: number
  /** The number of conversations in each folder, by folder ID. */
  folderCounts: ReadonlyMap<string, number>
  compact: boolean
}>()

const emit = defineEmits<{
  selectPlace: [place: ChatSessionsPlace]
  /** Creates a folder with this name. The list then shows it. */
  createFolder: [name: string]
  renameFolder: [payload: { folderId: string, name: string }]
  deleteFolder: [folderId: string]
}>()

/** The folder delete waits for its second press. The list cancels it on a press or a keyboard focus elsewhere. */
const confirmingDelete = defineModel<boolean>('confirmingDelete', { required: true })

const { t } = useI18n()
const placeMenuOpen = shallowRef(false)
const folderMenuOpen = shallowRef(false)
const renaming = shallowRef(false)
const folderName = ref('')
// Rename starts when the folder menu has closed, so the menu does not move focus back to its trigger.
const menuClose = useMenuCloseAction()
const placeTrigger = useTemplateRef<HTMLElement>('placeTrigger')
const nameField = useTemplateRef<InstanceType<typeof SessionNameField>>('nameField')

watch(() => props.place, () => {
  renaming.value = false
})

const placeLabel = computed(() => {
  if (props.place.kind === 'archive')
    return t('stage.chat.sessions.archived')
  if (props.place.kind === 'folder')
    return props.currentFolder?.name ?? ''
  return t('stage.chat.sessions.all-conversations')
})
const placeIcon = computed(() => {
  if (props.place.kind === 'archive')
    return 'i-mingcute:archive-line'
  if (props.place.kind === 'folder')
    return 'i-mingcute:folder-line'
  return undefined
})

function selectPlace(place: ChatSessionsPlace) {
  emit('selectPlace', place)
}

function createFolder(name: string) {
  placeMenuOpen.value = false
  emit('createFolder', name)
}

function pressDelete() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  confirmingDelete.value = false
  if (props.currentFolder)
    emit('deleteFolder', props.currentFolder.id)
}

function requestRename() {
  menuClose.request(async () => {
    if (!props.currentFolder)
      return
    folderName.value = props.currentFolder.name
    renaming.value = true
    await nextTick()
    nameField.value?.focus()
  })
}

/** An empty name keeps the old name. With `returnFocus`, focus goes to the title, so the keyboard user continues from it. */
async function endRename(save: boolean, returnFocus: boolean) {
  if (!renaming.value)
    return
  if (save && props.currentFolder && folderName.value.trim())
    emit('renameFolder', { folderId: props.currentFolder.id, name: folderName.value })
  renaming.value = false
  if (!returnFocus)
    return
  await nextTick()
  placeTrigger.value?.focus()
}

const menuCountClasses = ['ml-auto pl-3 text-xs tabular-nums text-neutral-400 dark:text-neutral-500']
const menuCheckClasses = ['i-mingcute:check-line size-4 shrink-0 text-primary-500']
</script>

<template>
  <div :class="['flex shrink-0 items-center gap-0.5', props.compact ? 'mb-0.5 min-h-8' : 'mb-2 min-h-11']">
    <SessionNameField
      v-if="renaming"
      ref="nameField"
      v-model="folderName"
      :label="t('stage.chat.sessions.folder-name')"
      :placeholder="t('stage.chat.sessions.folder-name-placeholder')"
      :save-label="t('stage.chat.sessions.save-folder')"
      :cancel-label="t('stage.chat.sessions.cancel-folder')"
      :compact="props.compact"
      @save="returnFocus => endRename(true, returnFocus)"
      @cancel="returnFocus => endRename(false, returnFocus)"
    />
    <template v-else>
      <DropdownMenu v-model:open="placeMenuOpen" align="start" :side-offset="4" :content-class="['min-w-56 max-w-72 max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto']">
        <template #trigger>
          <button
            ref="placeTrigger"
            type="button"
            :title="t('stage.chat.sessions.switch-place')"
            :class="[
              'min-w-0 inline-flex items-center outline-none',
              'transition-colors duration-200 motion-reduce:transition-none',
              'hover:text-primary-600 dark:hover:text-primary-300',
              'focus-visible:outline-2 focus-visible:outline-primary-500',
              placeMenuOpen ? 'text-primary-600 dark:text-primary-300' : '',
              props.compact
                ? 'h-8 gap-1 rounded-lg px-1.5 text-sm font-semibold'
                : '-ml-1 h-11 gap-1.5 rounded-xl px-1 text-xl font-semibold tracking-tight',
            ]"
          >
            <span v-if="placeIcon" aria-hidden="true" :class="[placeIcon, props.compact ? 'size-4' : 'size-5.5', 'shrink-0']" />
            <span :class="['truncate']">{{ placeLabel }}</span>
            <span
              aria-hidden="true"
              :class="[
                'i-mingcute:down-line shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                props.compact ? 'size-3.5' : 'size-4.5',
                placeMenuOpen ? 'rotate-180' : 'text-neutral-400 dark:text-neutral-500',
              ]"
            />
          </button>
        </template>
        <MenuItem @select="selectPlace({ kind: 'all' })">
          <span aria-hidden="true" :class="['i-mingcute:chat-2-line size-4 shrink-0']" />
          <span :class="['min-w-0 truncate']">{{ t('stage.chat.sessions.all-conversations') }}</span>
          <span :class="menuCountClasses">{{ props.liveCount }}</span>
          <span v-if="props.place.kind === 'all'" aria-hidden="true" :class="menuCheckClasses" />
        </MenuItem>
        <MenuLabel>{{ t('stage.chat.sessions.folders') }}</MenuLabel>
        <MenuItem
          v-for="folder in props.folders"
          :key="folder.id"
          @select="selectPlace({ kind: 'folder', folderId: folder.id })"
        >
          <span aria-hidden="true" :class="['i-mingcute:folder-line size-4 shrink-0']" />
          <span :class="['min-w-0 truncate']">{{ folder.name }}</span>
          <span :class="menuCountClasses">{{ props.folderCounts.get(folder.id) ?? 0 }}</span>
          <span v-if="props.place.kind === 'folder' && props.place.folderId === folder.id" aria-hidden="true" :class="menuCheckClasses" />
        </MenuItem>
        <SessionMenuNewFolder @create="createFolder" />
        <MenuSeparator />
        <MenuItem @select="selectPlace({ kind: 'archive' })">
          <span aria-hidden="true" :class="['i-mingcute:archive-line size-4 shrink-0']" />
          <span :class="['min-w-0 truncate']">{{ t('stage.chat.sessions.archived') }}</span>
          <span :class="menuCountClasses">{{ props.archivedCount }}</span>
          <span v-if="props.place.kind === 'archive'" aria-hidden="true" :class="menuCheckClasses" />
        </MenuItem>
      </DropdownMenu>
      <span :class="['flex-1']" />
      <template v-if="props.currentFolder">
        <!-- Deleting a folder keeps its conversations. The button turns into its confirmation in place. -->
        <SessionDeleteButton
          data-session-confirm="folder"
          :confirming="confirmingDelete"
          :compact="props.compact"
          :label="t('stage.chat.sessions.delete-folder')"
          :confirm-label="t('stage.chat.sessions.confirm-delete-folder')"
          @press="pressDelete"
        />
        <DropdownMenu
          v-model:open="folderMenuOpen"
          align="end"
          :side-offset="4"
          @close-auto-focus="menuClose.onCloseAutoFocus"
        >
          <template #trigger>
            <button
              type="button"
              :aria-label="t('stage.chat.sessions.folder-actions')"
              :title="t('stage.chat.sessions.folder-actions')"
              :class="[
                iconButtonClasses,
                folderMenuOpen ? 'text-primary-500 dark:text-primary-400' : quietIconClasses,
                props.compact ? 'size-8' : 'size-10',
              ]"
            >
              <span aria-hidden="true" :class="['i-mingcute:more-2-fill', props.compact ? 'size-4' : 'size-5']" />
            </button>
          </template>
          <MenuItem @select="requestRename">
            <span aria-hidden="true" :class="['i-mingcute:edit-2-line size-4 shrink-0']" />
            {{ t('stage.chat.sessions.rename-folder') }}
          </MenuItem>
        </DropdownMenu>
      </template>
    </template>
  </div>
</template>
