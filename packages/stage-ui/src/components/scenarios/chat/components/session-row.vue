<script lang="ts">
import type { ChatSessionFolder, ChatSessionMeta } from '../../../../types/chat-session'

import { Avatar, BasicButton, DropdownMenu, Input, MenuItem, menuItemClasses, MenuSeparator, SwipeActionButton, SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
import { DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from 'reka-ui'
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionFolderTargets from './session-folder-targets.vue'

import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

/** A conversation preview prepared by the session owner for either dialog surface. */
export interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  isActive: boolean
  activityAtLabel: string
  /** The name of the character of the conversation. */
  characterName: string
  /** The preview image of the default model of the character. Without it, the avatar shows its fallback. */
  characterPreview?: string
}
</script>

<script setup lang="ts">
const props = defineProps<{
  row: SessionRow
  /** Folders that the Move to folder menu offers. */
  folders: ChatSessionFolder[]
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
let renameRequested = false
const rowRoot = useTemplateRef<HTMLElement>('rowRoot')
const renameGroup = useTemplateRef<HTMLElement>('renameGroup')

watch(menuOpen, (open) => {
  if (open)
    menuPage.value = 'actions'
})
watch(() => props.selecting, (selecting) => {
  if (selecting)
    cancelRename()
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
  renameRequested = true
}

async function openRenameAfterMenu(event: Event) {
  if (!renameRequested)
    return
  renameRequested = false
  event.preventDefault()
  renameTitle.value = props.row.meta.title ?? props.row.preview
  renaming.value = true
  await nextTick()
  const input = renameGroup.value?.querySelector('input')
  input?.focus()
  input?.select()
}

function cancelRename() {
  renaming.value = false
  renameTitle.value = ''
}

function commitRename() {
  if (!renaming.value)
    return
  emit('rename', renameTitle.value)
  cancelRename()
}

/** Enter, Escape, Save, and Cancel keep focus on the row, so the keyboard user continues from it. */
async function finishRename(save: boolean) {
  if (save)
    commitRename()
  else
    cancelRename()
  await nextTick()
  rowRoot.value?.querySelector<HTMLElement>('[data-session-main]')?.focus()
}

/** Focus that leaves the name field and its buttons saves a name, and cancels an empty field. */
function handleRenameFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && renameGroup.value?.contains(event.relatedTarget))
    return
  if (renameTitle.value.trim())
    commitRename()
  else
    cancelRename()
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

const subMenuClasses = [
  'z-[10001] min-w-44 rounded-xl border p-1 shadow-lg outline-none',
  'border-neutral-100 bg-white text-neutral-700 dark:border-neutral-700/50 dark:bg-neutral-800 dark:text-neutral-100',
]
const avatarClasses = computed(() => ['relative shrink-0', props.compact ? 'size-7' : 'size-9'])
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
      <span :class="avatarClasses">
        <Avatar
          :src="props.row.characterPreview"
          :class="['block size-full rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-700', '[&_[data-avatar-image]]:object-top']"
        >
          <template #fallback>
            <span aria-hidden="true" :class="['i-mingcute:user-3-line', props.compact ? 'size-4' : 'size-5']" />
          </template>
        </Avatar>
      </span>
      <span :class="['min-w-0 flex-1']">
        <span :class="['block truncate text-sm font-medium']">{{ props.row.preview }}</span>
        <span :class="['flex items-center gap-2 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
          <span>{{ props.row.activityAtLabel }}</span>
          <span v-if="folderName" :class="['min-w-0 inline-flex items-center gap-1']">
            <span aria-hidden="true" :class="['i-mingcute:folder-line size-3.5 shrink-0']" />
            <span :class="['truncate']">{{ folderName }}</span>
          </span>
          <span :class="['sr-only']">{{ props.row.characterName }}</span>
        </span>
      </span>
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
            ref="renameGroup"
            :class="['session-rename', props.compact ? 'min-h-12.5 gap-2 px-2 py-1.5' : 'min-h-20 gap-3 px-3 py-3', 'min-w-0 flex flex-1 items-center']"
            @focusout="handleRenameFocusOut"
          >
            <span :class="avatarClasses">
              <Avatar
                :src="props.row.characterPreview"
                :class="['block size-full rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-700', '[&_[data-avatar-image]]:object-top']"
              >
                <template #fallback>
                  <span aria-hidden="true" :class="['i-mingcute:user-3-line', props.compact ? 'size-4' : 'size-5']" />
                </template>
              </Avatar>
            </span>
            <div :class="['min-w-0 flex flex-1 items-center gap-0.5']">
              <Input
                v-model="renameTitle"
                :aria-label="t('stage.chat.sessions.rename-input')"
                :placeholder="t('stage.chat.sessions.rename-placeholder')"
                @click.stop
                @keydown.enter.stop.prevent="finishRename(true)"
                @keydown.esc.stop="finishRename(false)"
              />
              <!-- The buttons keep focus in the field on press, so leaving focus does not save before Cancel runs. -->
              <button
                type="button"
                :aria-label="t('stage.chat.sessions.save-rename')"
                :title="t('stage.chat.sessions.save-rename')"
                :class="[iconButtonClasses, props.compact ? 'size-8' : 'size-9', 'text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300']"
                @pointerdown.prevent
                @click.stop="finishRename(true)"
              >
                <span aria-hidden="true" :class="['i-mingcute:check-line', props.compact ? 'size-4' : 'size-5']" />
              </button>
              <button
                type="button"
                :aria-label="t('stage.chat.sessions.cancel-rename')"
                :title="t('stage.chat.sessions.cancel-rename')"
                :class="[iconButtonClasses, props.compact ? 'size-8' : 'size-9', quietIconClasses]"
                @pointerdown.prevent
                @click.stop="finishRename(false)"
              >
                <span aria-hidden="true" :class="['i-mingcute:close-line', props.compact ? 'size-4' : 'size-5']" />
              </button>
            </div>
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
            <!-- The avatar of the character, as the character switcher shows it. The current conversation adds a check. -->
            <span :class="avatarClasses">
              <Avatar
                :src="props.row.characterPreview"
                :class="['block size-full rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-700', '[&_[data-avatar-image]]:object-top']"
              >
                <template #fallback>
                  <span aria-hidden="true" :class="['i-mingcute:user-3-line', props.compact ? 'size-4' : 'size-5']" />
                </template>
              </Avatar>
              <span
                v-if="props.row.isActive"
                aria-hidden="true"
                :class="[
                  'absolute flex items-center justify-center rounded-full bg-primary-500 text-white ring-2 ring-primary-50 dark:ring-primary-950',
                  props.compact ? '-bottom-0.5 -right-0.5 size-3.5' : '-bottom-0.5 -right-0.5 size-4',
                ]"
              >
                <span :class="['i-mingcute:check-fill size-2.5']" />
              </span>
            </span>
            <span :class="['min-w-0 flex-1']">
              <span :class="['block truncate text-sm font-medium']">{{ props.row.preview }}</span>
              <span :class="['flex items-center gap-2 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
                <span
                  v-if="props.row.meta.pinnedAt && !archived"
                  role="img"
                  :aria-label="t('stage.chat.sessions.pinned')"
                  :title="t('stage.chat.sessions.pinned')"
                  :class="['i-mingcute:pin-line size-3.5 shrink-0']"
                />
                <span>{{ props.row.activityAtLabel }}</span>
                <span v-if="props.row.isActive && !props.compact" :class="['text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
                <span v-if="folderName" :class="['min-w-0 inline-flex items-center gap-1']">
                  <span aria-hidden="true" :class="['i-mingcute:folder-line size-3.5 shrink-0']" />
                  <span :class="['truncate']">{{ folderName }}</span>
                </span>
                <span v-if="props.row.meta.cloudChatId" role="img" :aria-label="t('stage.chat.sessions.cloud-badge')" :title="t('stage.chat.sessions.cloud-badge')" :class="['i-mingcute:cloud-line size-4 shrink-0']" />
                <span :class="['sr-only']">{{ props.row.characterName }}</span>
              </span>
            </span>
          </BasicButton>

          <template v-if="!renaming">
            <!--
              Delete stays on the row, outside the menu. The compact row turns the button into its confirmation in
              place. The mobile row opens the swipe area, where Delete is the second press.
            -->
            <button
              v-if="props.compact"
              type="button"
              :data-session-confirm="`row:${props.row.meta.sessionId}`"
              :aria-label="props.confirmingDelete
                ? `${t('stage.chat.sessions.confirm-delete-short')}: ${props.row.preview}`
                : `${t('stage.chat.sessions.delete')}: ${props.row.preview}`"
              :title="props.confirmingDelete ? t('stage.chat.sessions.confirm-delete-short') : t('stage.chat.sessions.delete')"
              :class="props.confirmingDelete
                ? [
                  'session-confirm-pill h-7 shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 outline-none',
                  'bg-red-500/10 text-xs font-semibold text-red-500 dark:text-red-400',
                  'focus-visible:outline-2 focus-visible:outline-red-500',
                ]
                : [
                  iconButtonClasses, 'size-8',
                  'text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                ]"
              @click="pressDelete"
            >
              <span aria-hidden="true" :class="[props.confirmingDelete ? 'i-mingcute:delete-2-fill size-3.5' : 'i-mingcute:delete-2-line size-4']" />
              <template v-if="props.confirmingDelete">
                {{ t('stage.chat.sessions.confirm-delete-short') }}
              </template>
            </button>
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
              content-class="min-w-48"
              @close-auto-focus="openRenameAfterMenu"
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

.session-confirm-pill {
  animation: session-confirm-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes session-confirm-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
}

@media (prefers-reduced-motion: reduce) {
  .session-check,
  .session-rename,
  .session-confirm-pill {
    animation: none;
  }
}
</style>
