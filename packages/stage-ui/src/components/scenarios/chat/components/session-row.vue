<script setup lang="ts">
import type { ChatSessionFolder } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { BasicButton, DropdownMenu, MenuItem, menuItemClasses, MenuSeparator, SwipeActionButton, SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
import { DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from 'reka-ui'
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionDeleteButton from './session-delete-button.vue'
import SessionFolderTargets from './session-folder-targets.vue'
import SessionNameField from './session-name-field.vue'
import SessionRowAvatar from './session-row-avatar.vue'
import SessionRowSummary from './session-row-summary.vue'

import { useMenuCloseAction } from '../composables/use-menu-close-action'
import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

const props = defineProps<{
  row: SessionRow
  /** Folders that the Move to folder menu offers. */
  folders: readonly ChatSessionFolder[]
  compact: boolean
  /** The list selects conversations for a batch action, so the row toggles its selection instead of opening. */
  selecting: boolean
  selected: boolean
  /** Shows the folder of the conversation in its details. A folder view leaves it out, because its title names the folder. */
  showFolder: boolean
  /** The compact row asks for a second press on its delete button. The list keeps one such request at a time. */
  confirmingDelete: boolean
}>()

const emit = defineEmits<{
  select: []
  toggleSelected: []
  rename: [title: string]
  pin: [pinned: boolean]
  archive: [archived: boolean]
  /** `undefined` moves the conversation out of its folder. */
  move: [folderId: string | undefined]
  /** Creates a folder with this name, then moves the conversation into it. */
  createFolder: [name: string]
  /** The first press on the delete button of a compact row. */
  armDelete: []
  delete: []
}>()

/** The swipe area of the mobile row. The list keeps one row open at a time. */
const swipeOpen = defineModel<boolean>('swipeOpen', { default: false })

const { t } = useI18n()
const menuOpen = shallowRef(false)
/** The mobile menu shows the folder targets in place of its items, because a side menu does not fit a phone. */
const menuPage = shallowRef<'actions' | 'folders'>('actions')
const renaming = shallowRef(false)
const renameTitle = ref('')
// Rename starts when the menu has closed, so the menu does not move focus back to its trigger after the field opens.
const menuClose = useMenuCloseAction()
const rowRoot = useTemplateRef<HTMLElement>('rowRoot')
const nameField = useTemplateRef<InstanceType<typeof SessionNameField>>('nameField')

watch(menuOpen, (open) => {
  if (open)
    menuPage.value = 'actions'
})
watch(() => props.selecting, (selecting) => {
  if (selecting)
    endRename(false)
})

const archived = computed(() => props.row.meta.archivedAt !== undefined)
const folderName = computed(() => {
  if (!props.showFolder || !props.row.meta.folderId)
    return undefined
  return props.folders.find(folder => folder.id === props.row.meta.folderId)?.name
})

function showFolders(event: Event) {
  event.preventDefault()
  menuPage.value = 'folders'
}

function showActions(event: Event) {
  event.preventDefault()
  menuPage.value = 'actions'
}

function moveTo(folderId: string | undefined) {
  menuOpen.value = false
  emit('move', folderId)
}

function createFolder(name: string) {
  menuOpen.value = false
  emit('createFolder', name)
}

function requestRename() {
  menuClose.request(async () => {
    renameTitle.value = props.row.meta.title ?? props.row.preview
    renaming.value = true
    await nextTick()
    nameField.value?.focus()
  })
}

/** Closes the field. With `returnFocus`, focus goes to the row, so the keyboard user continues from it. */
async function endRename(returnFocus: boolean) {
  renaming.value = false
  renameTitle.value = ''
  if (!returnFocus)
    return
  await nextTick()
  rowRoot.value?.querySelector<HTMLElement>('[data-session-main]')?.focus()
}

/** An empty title gives the conversation back its automatic title. */
function saveRename(returnFocus: boolean) {
  if (!renaming.value)
    return
  emit('rename', renameTitle.value)
  void endRename(returnFocus)
}

function runSwipeAction(value: string) {
  if (value === 'archive')
    emit('archive', !archived.value)
  else
    emit('delete')
}

function pressDelete() {
  if (props.confirmingDelete)
    emit('delete')
  else
    emit('armDelete')
}

// A long folder list scrolls inside the room that the menu has on screen.
const subMenuClasses = [
  'z-[10001] min-w-44 max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border p-1 shadow-lg outline-none',
  'border-neutral-100 bg-white text-neutral-700 dark:border-neutral-700/50 dark:bg-neutral-800 dark:text-neutral-100',
]
</script>

<template>
  <div ref="rowRoot">
    <BasicButton
      v-if="props.selecting"
      size="unset"
      :aria-pressed="props.selected"
      :class="[
        'session-select active:scale-100! w-full min-w-0 text-left',
        'transition-colors duration-200 motion-reduce:transition-none',
        props.compact ? 'min-h-12.5 rounded-lg px-2 py-1.5' : 'min-h-20 rounded-2xl px-3 py-3',
        props.selected
          ? 'bg-primary-50/80 dark:bg-primary-950/80'
          : props.compact ? 'bg-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80' : 'bg-white dark:bg-neutral-800',
        'focus-visible:outline-2 focus-visible:outline-primary-500',
      ]"
      @click="emit('toggleSelected')"
    >
      <!-- The mark mounts again on each change, so it pops in when selection starts and on each toggle. -->
      <span
        :key="String(props.selected)"
        aria-hidden="true"
        :class="[
          'session-check shrink-0',
          props.compact ? 'size-4' : 'size-5',
          props.selected
            ? 'i-mingcute:check-circle-fill text-primary-500'
            : 'border-2 border-solid border-neutral-300 rounded-full dark:border-neutral-600',
        ]"
      />
      <SessionRowSummary :row="props.row" :compact="props.compact" :folder-name="folderName" :marks="false" />
    </BasicButton>

    <SwipeActionsRoot
      v-else
      v-slot="{ open, toggle }"
      v-model:open="swipeOpen"
      :disabled="props.compact || renaming"
      @action="runSwipeAction"
    >
      <SwipeActionsList v-if="!props.compact" :gap="16" default-action="delete">
        <SwipeActionsItem v-slot="{ takeover }" value="archive" as-child>
          <SwipeActionButton
            :label="archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive')"
            :aria-label="archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive')"
            :icon="archived ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line'"
            surface-class="bg-neutral-500 text-white"
            :takeover="takeover"
            :class="['text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-neutral-500 dark:text-neutral-300']"
          />
        </SwipeActionsItem>
        <SwipeActionsItem v-slot="{ takeover }" value="delete" as-child>
          <SwipeActionButton
            :label="t('stage.chat.sessions.delete-short')"
            :aria-label="t('stage.chat.sessions.delete')"
            icon="i-mingcute:delete-2-line"
            surface-class="bg-red-500 text-white"
            :takeover="takeover"
            :class="['text-red-500 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-red-500']"
          />
        </SwipeActionsItem>
      </SwipeActionsList>
      <SwipeActionsContent>
        <div
          :class="[
            'group flex items-center overflow-hidden',
            props.compact ? 'rounded-lg pr-0.5' : 'rounded-2xl pr-1',
            props.row.isActive
              ? 'bg-primary-50/80 dark:bg-primary-950/80'
              : props.compact ? 'bg-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80' : 'bg-white dark:bg-neutral-800',
          ]"
        >
          <div
            v-if="renaming"
            :class="['session-rename', props.compact ? 'min-h-12.5 gap-2 px-2 py-1.5' : 'min-h-20 gap-3 px-3 py-3', 'min-w-0 flex flex-1 items-center']"
          >
            <SessionRowAvatar :src="props.row.characterPreview" :compact="props.compact" :current="false" />
            <SessionNameField
              ref="nameField"
              v-model="renameTitle"
              :label="t('stage.chat.sessions.rename-input')"
              :placeholder="t('stage.chat.sessions.rename-placeholder')"
              :save-label="t('stage.chat.sessions.save-rename')"
              :cancel-label="t('stage.chat.sessions.cancel-rename')"
              :compact="props.compact"
              @save="saveRename"
              @cancel="endRename"
            />
          </div>
          <BasicButton
            v-else
            data-session-main
            size="unset"
            :aria-current="props.row.isActive ? 'true' : undefined"
            :class="[
              'session-select active:scale-100! min-w-0 flex-1 text-left',
              props.compact ? 'min-h-12.5 rounded-lg px-2 py-1.5' : 'min-h-20 rounded-2xl px-3 py-3',
              'focus-visible:outline-2 focus-visible:outline-primary-500',
            ]"
            @click="emit('select')"
          >
            <SessionRowSummary :row="props.row" :compact="props.compact" :folder-name="folderName" marks />
          </BasicButton>

          <template v-if="!renaming">
            <!--
              Delete stays on the row, outside the menu. The compact row turns the button into its confirmation in
              place. The mobile row opens the swipe area, where Delete is the second press.
            -->
            <SessionDeleteButton
              v-if="props.compact"
              :data-session-confirm="`row:${props.row.meta.sessionId}`"
              :confirming="props.confirmingDelete"
              compact
              :label="t('stage.chat.sessions.delete')"
              :confirm-label="t('stage.chat.sessions.confirm-delete-short')"
              :subject="props.row.preview"
              reveal-on-hover
              @press="pressDelete"
            />
            <button
              v-else
              type="button"
              :aria-label="`${t('stage.chat.sessions.delete')}: ${props.row.preview}`"
              :title="t('stage.chat.sessions.delete')"
              :aria-expanded="open"
              :tabindex="open ? -1 : 0"
              :class="[iconButtonClasses, 'size-11 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400']"
              :style="{ opacity: 'calc(1 - var(--swipe-progress, 0))' }"
              @click="toggle()"
            >
              <span aria-hidden="true" :class="['i-mingcute:delete-2-line size-5']" />
            </button>

            <DropdownMenu
              v-model:open="menuOpen"
              align="end"
              :side-offset="4"
              :content-class="['min-w-48 max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto']"
              @close-auto-focus="menuClose.onCloseAutoFocus"
            >
              <template #trigger>
                <!-- The open menu keeps the icon in the theme color, which marks the row that the menu belongs to. -->
                <button
                  type="button"
                  :aria-label="`${t('stage.chat.sessions.more-actions')}: ${props.row.preview}`"
                  :title="t('stage.chat.sessions.more-actions')"
                  :tabindex="open ? -1 : 0"
                  :class="[
                    iconButtonClasses,
                    menuOpen ? 'text-primary-500 dark:text-primary-400' : quietIconClasses,
                    props.compact
                      ? ['size-8', menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100']
                      : 'size-11',
                  ]"
                  :style="props.compact ? undefined : { opacity: 'calc(1 - var(--swipe-progress, 0))' }"
                >
                  <span aria-hidden="true" :class="['i-mingcute:more-2-fill', props.compact ? 'size-4' : 'size-5']" />
                </button>
              </template>

              <template v-if="menuPage === 'folders'">
                <MenuItem @select="showActions">
                  <span aria-hidden="true" :class="['i-mingcute:left-line size-4 shrink-0']" />
                  {{ t('stage.chat.sessions.move-to-folder') }}
                </MenuItem>
                <MenuSeparator />
                <SessionFolderTargets
                  :folders="props.folders"
                  :current-folder-id="props.row.meta.folderId"
                  :in-folder="props.row.meta.folderId !== undefined"
                  @move="moveTo"
                  @create="createFolder"
                />
              </template>
              <template v-else>
                <MenuItem v-if="!archived" @select="emit('pin', !props.row.meta.pinnedAt)">
                  <span aria-hidden="true" :class="[props.row.meta.pinnedAt ? 'i-mingcute:pin-fill' : 'i-mingcute:pin-line', 'size-4 shrink-0']" />
                  {{ props.row.meta.pinnedAt ? t('stage.chat.sessions.unpin') : t('stage.chat.sessions.pin') }}
                </MenuItem>
                <DropdownMenuSub v-if="props.compact">
                  <DropdownMenuSubTrigger :class="menuItemClasses">
                    <span aria-hidden="true" :class="['i-mingcute:folder-line size-4 shrink-0']" />
                    <span :class="['flex-1']">{{ t('stage.chat.sessions.move-to-folder') }}</span>
                    <span aria-hidden="true" :class="['i-mingcute:right-line size-4 shrink-0 opacity-60']" />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent :side-offset="6" :collision-padding="8" :class="subMenuClasses">
                      <SessionFolderTargets
                        :folders="props.folders"
                        :current-folder-id="props.row.meta.folderId"
                        :in-folder="props.row.meta.folderId !== undefined"
                        @move="moveTo"
                        @create="createFolder"
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                <MenuItem v-else @select="showFolders">
                  <span aria-hidden="true" :class="['i-mingcute:folder-line size-4 shrink-0']" />
                  <span :class="['flex-1']">{{ t('stage.chat.sessions.move-to-folder') }}</span>
                  <span aria-hidden="true" :class="['i-mingcute:right-line size-4 shrink-0 opacity-60']" />
                </MenuItem>
                <MenuItem @select="requestRename">
                  <span aria-hidden="true" :class="['i-mingcute:edit-2-line size-4 shrink-0']" />
                  {{ t('stage.chat.sessions.rename') }}
                </MenuItem>
                <MenuSeparator />
                <MenuItem @select="emit('archive', !archived)">
                  <span aria-hidden="true" :class="[archived ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line', 'size-4 shrink-0']" />
                  {{ archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive') }}
                </MenuItem>
              </template>
            </DropdownMenu>
          </template>
        </div>
      </SwipeActionsContent>
    </SwipeActionsRoot>
  </div>
</template>

<style scoped>
.session-select :deep(.basic-button-content) {
  width: 100%;
  min-width: 0;
  gap: 0.75rem;
}

.session-check {
  animation: session-check-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes session-check-in {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
}

.session-rename {
  animation: session-rename-in 180ms ease-out;
}
@keyframes session-rename-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .session-check,
  .session-rename {
    animation: none;
  }
}
</style>
