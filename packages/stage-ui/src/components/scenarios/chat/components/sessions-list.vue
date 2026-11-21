<script setup lang="ts">
import type { ChatSessionFolder, ChatSessionsPlace } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { AnimatedHeight, Avatar, BasicButton, Button, DropdownMenu, GhostButton, ScrollableArea } from '@proj-airi/ui'
import { useEventListener, usePreferredReducedMotion, useResizeObserver, useScroll } from '@vueuse/core'
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionFolderTargets from './session-folder-targets.vue'
import SessionRowItem from './session-row.vue'
import SessionsListHeader from './sessions-list-header.vue'

import { useListReorderMotion } from '../composables/use-list-reorder-motion'

const props = withDefaults(defineProps<{
  /** Every conversation of the user, archived ones included. */
  rows: SessionRow[]
  /** Every character of the user. The filter offers each one, also one without conversations, so a first conversation can go to it. */
  characters: Array<{ id: string, name: string, preview?: string }>
  folders: readonly ChatSessionFolder[]
  isCreatingSession: boolean
  /** The desktop popover. Rows are denser, and the list keeps a fixed maximum height. */
  compact?: boolean
}>(), {
  compact: false,
})

const emit = defineEmits<{
  deleteSession: [sessionId: string]
  deleteSessions: [sessionIds: string[]]
  /** Creates a conversation in the folder and for the character of the payload. Each one left out uses the default. */
  newSession: [payload: { folderId?: string, characterId?: string }]
  renameSession: [payload: { sessionId: string, title: string }]
  selectSession: [sessionId: string]
  pinSession: [payload: { sessionId: string, pinned: boolean }]
  archiveSessions: [payload: { sessionIds: string[], archived: boolean }]
  /** `folderId: undefined` moves the conversations out of their folder. */
  moveSessions: [payload: { sessionIds: string[], folderId: string | undefined }]
  /** Creates a folder, then moves the conversations into it. With `open`, the list then shows the new folder. */
  createFolder: [payload: { name: string, sessionIds: string[], open: boolean }]
  renameFolder: [payload: { folderId: string, name: string }]
  deleteFolder: [folderId: string]
}>()

const { t } = useI18n()

/**
 * The place that the user chose. The owner can keep it after the list closes, so the list opens where the user left it.
 */
const chosenPlace = defineModel<ChatSessionsPlace>('place', { default: () => ({ kind: 'all' }) })
/** The character that the user chose for the filter. `undefined` shows every character. The owner can keep it too. */
const chosenCharacterId = defineModel<string>('characterId')
// The swipe area that is open belongs to this open list, never to persisted session state.
const expandedSessionId = shallowRef<string>()
/** The compact row that waits for the second press on its delete button. */
const pendingDeleteSessionId = shallowRef<string>()
// Selection mode belongs to the open list owner, so closing the list can end it.
const selecting = defineModel<boolean>('selecting', { default: false })
const selectedIds = shallowRef(new Set<string>())
// The first press on the batch delete action only asks for confirmation, like the single-row delete.
const confirmingBatchDelete = shallowRef(false)
const confirmingFolderDelete = shallowRef(false)
const batchMoveOpen = shallowRef(false)

const chips = useTemplateRef<HTMLElement>('chips')

/** The chosen folder. It is missing when this list or another window deleted it. */
const currentFolder = computed(() => {
  const chosen = chosenPlace.value
  return chosen.kind === 'folder' ? props.folders.find(folder => folder.id === chosen.folderId) : undefined
})
const allPlace: ChatSessionsPlace = { kind: 'all' }
/** The place that the list shows. A chosen folder that no longer exists shows every conversation. */
const place = computed(() => chosenPlace.value.kind === 'folder' && !currentFolder.value ? allPlace : chosenPlace.value)

const liveRows = computed(() => props.rows.filter(row => row.meta.archivedAt === undefined))
const archivedCount = computed(() => props.rows.length - liveRows.value.length)
const folderCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const row of liveRows.value) {
    if (row.meta.folderId)
      counts.set(row.meta.folderId, (counts.get(row.meta.folderId) ?? 0) + 1)
  }
  return counts
})

/** The conversations of the current place, before the character filter. */
const placeRows = computed(() => {
  const current = place.value
  if (current.kind === 'archive')
    return props.rows.filter(row => row.meta.archivedAt !== undefined)
  if (current.kind === 'folder')
    return liveRows.value.filter(row => row.meta.folderId === current.folderId)
  return liveRows.value
})

/** Every character with the number of its conversations in the current place. */
const characterChips = computed(() => {
  const counts = new Map<string, number>()
  for (const row of placeRows.value)
    counts.set(row.meta.characterId, (counts.get(row.meta.characterId) ?? 0) + 1)

  return props.characters.map(character => ({ ...character, count: counts.get(character.id) ?? 0 }))
})

/**
 * The character that the filter applies. A new conversation goes to it, and the empty state and the primary action
 * name it. A chosen character that no longer exists applies no filter.
 */
const filteredCharacter = computed(() => characterChips.value.find(chip => chip.id === chosenCharacterId.value))
const characterFilter = computed(() => filteredCharacter.value?.id)

/** The rows that the list shows. Pinned conversations come first, and the rows already arrive in the order of their last message. */
const visibleRows = computed(() => {
  const rows = placeRows.value.filter(row => characterFilter.value === undefined || row.meta.characterId === characterFilter.value)
  return [...rows].sort((first, second) => Number(!!second.meta.pinnedAt) - Number(!!first.meta.pinnedAt))
})

// The selection survives a change of place or character. Only the rows that the list shows count and take a batch action.
const selectedRows = computed(() => visibleRows.value.filter(row => selectedIds.value.has(row.meta.sessionId)))
const allSelected = computed(() => visibleRows.value.length > 0 && selectedRows.value.length === visibleRows.value.length)
/** The folder that every selected conversation is in. The batch menu marks it, also in all conversations and the archive. */
const selectedFolderId = computed(() => {
  const folderIds = new Set(selectedRows.value.map(row => row.meta.folderId))
  return folderIds.size === 1 ? [...folderIds][0] : undefined
})
/** Whether a selected conversation is in a folder. The batch menu then offers No folder. */
const selectionInFolder = computed(() => selectedRows.value.some(row => row.meta.folderId !== undefined))

/** The primary action creates a conversation, or deletes the selection while selecting. */
const primaryAction = computed(() => {
  if (!selecting.value) {
    return {
      key: 'new',
      icon: props.compact ? 'i-mingcute:add-circle-line' : 'i-mingcute:edit-line',
      label: newSessionLabel(),
    }
  }
  if (confirmingBatchDelete.value) {
    return {
      key: 'confirm-delete',
      icon: 'i-mingcute:delete-2-fill',
      label: t('stage.chat.sessions.confirm-delete-selected', selectedRows.value.length),
    }
  }
  return {
    key: 'delete',
    icon: 'i-mingcute:delete-2-line',
    label: t('stage.chat.sessions.delete-selected', selectedRows.value.length),
  }
})

/**
 * The buttons of the action row. The popover shows plain buttons that fill on hover, and the drawer and the dialog show
 * filled buttons. The primary action turns red while selecting, and solid while it waits for the second press.
 */
const actionButtons = computed(() => {
  if (props.compact) {
    return {
      primary: BasicButton,
      primaryProps: {
        class: [
          'session-primary-action session-primary-action--start h-9 min-w-0 flex-1 rounded-lg px-2 text-sm outline-none',
          selecting.value
            ? ['text-red-500 hover:bg-red-500/10 dark:text-red-400', confirmingBatchDelete.value ? 'bg-red-500/10' : '']
            : 'text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/70',
          'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]',
        ],
      },
      secondary: GhostButton,
      secondaryProps: {},
      iconSize: 'size-4.5',
    }
  }
  return {
    primary: Button,
    primaryProps: {
      color: selecting.value ? 'red' : 'primary',
      variant: confirmingBatchDelete.value ? 'primary' : 'secondary',
      class: ['session-primary-action min-h-12 min-w-0 flex-1 rounded-2xl px-4 py-3'],
    },
    secondary: Button,
    secondaryProps: { color: 'neutral', variant: 'secondary' },
    iconSize: 'size-5',
  }
})

const emptyState = computed(() => {
  const name = filteredCharacter.value?.name
  if (place.value.kind === 'archive') {
    return {
      icon: 'i-mingcute:archive-line',
      text: name === undefined ? t('stage.chat.sessions.empty-archive') : t('stage.chat.sessions.empty-archive-character', { name }),
    }
  }
  if (place.value.kind === 'folder') {
    const folder = currentFolder.value?.name ?? ''
    return {
      icon: 'i-mingcute:folder-line',
      text: name === undefined
        ? t('stage.chat.sessions.empty-folder', { folder })
        : t('stage.chat.sessions.empty-folder-character', { folder, name }),
    }
  }
  return {
    icon: 'i-mingcute:chat-1-line',
    text: name === undefined ? t('stage.chat.sessions.empty') : t('stage.chat.sessions.empty-character', { name }),
  }
})

watch(selectedIds, () => {
  confirmingBatchDelete.value = false
})

watch(selecting, (value) => {
  selectedIds.value = new Set()
  confirmingBatchDelete.value = false
  if (value) {
    expandedSessionId.value = undefined
    pendingDeleteSessionId.value = undefined
  }
})

watch([place, characterFilter], () => {
  expandedSessionId.value = undefined
  pendingDeleteSessionId.value = undefined
  confirmingBatchDelete.value = false
  confirmingFolderDelete.value = false
})

function isPlace(target: ChatSessionsPlace) {
  const current = place.value
  if (current.kind === 'folder' && target.kind === 'folder')
    return current.folderId === target.folderId
  return current.kind === target.kind
}

function setPlace(target: ChatSessionsPlace) {
  if (!isPlace(target))
    chosenPlace.value = target
}

function toggleSelected(sessionId: string) {
  const next = new Set(selectedIds.value)
  if (!next.delete(sessionId))
    next.add(sessionId)
  selectedIds.value = next
}

function toggleAllSelected() {
  const next = new Set(selectedIds.value)
  for (const row of visibleRows.value) {
    if (allSelected.value)
      next.delete(row.meta.sessionId)
    else
      next.add(row.meta.sessionId)
  }
  selectedIds.value = next
}

function newSessionLabel() {
  const folder = currentFolder.value?.name
  const name = filteredCharacter.value?.name
  if (folder !== undefined) {
    return name === undefined
      ? t('stage.chat.sessions.new-in-folder', { folder })
      : t('stage.chat.sessions.new-in-folder-with-character', { folder, name })
  }
  return name === undefined ? t('stage.chat.sessions.new') : t('stage.chat.sessions.new-with-character', { name })
}

function runPrimaryAction() {
  if (!selecting.value) {
    emit('newSession', { folderId: currentFolder.value?.id, characterId: characterFilter.value })
    return
  }
  const sessionIds = selectedRows.value.map(row => row.meta.sessionId)
  if (sessionIds.length === 0)
    return
  if (!confirmingBatchDelete.value) {
    confirmingBatchDelete.value = true
    return
  }
  emit('deleteSessions', sessionIds)
  selecting.value = false
}

function archiveSelected() {
  const sessionIds = selectedRows.value.map(row => row.meta.sessionId)
  if (sessionIds.length === 0)
    return
  emit('archiveSessions', { sessionIds, archived: place.value.kind !== 'archive' })
  selecting.value = false
}

function moveSelected(folderId: string | undefined) {
  const sessionIds = selectedRows.value.map(row => row.meta.sessionId)
  batchMoveOpen.value = false
  if (sessionIds.length === 0)
    return
  emit('moveSessions', { sessionIds, folderId })
  selecting.value = false
}

function createFolderForSelection(name: string) {
  const sessionIds = selectedRows.value.map(row => row.meta.sessionId)
  batchMoveOpen.value = false
  emit('createFolder', { name, sessionIds, open: false })
  selecting.value = false
}

function selectSession(sessionId: string) {
  expandedSessionId.value = undefined
  pendingDeleteSessionId.value = undefined
  emit('selectSession', sessionId)
}

function deleteRow(sessionId: string) {
  pendingDeleteSessionId.value = undefined
  expandedSessionId.value = undefined
  emit('deleteSession', sessionId)
}

/**
 * Cancels each delete that waits for its second press, unless the event target is the button of that delete.
 * A click or keyboard focus anywhere else ends the confirmation, like Escape.
 */
function dropConfirmations(target: EventTarget | null) {
  const keep = target instanceof Element ? target.closest('[data-session-confirm]')?.getAttribute('data-session-confirm') : undefined
  let dropped = false
  if (pendingDeleteSessionId.value && keep !== `row:${pendingDeleteSessionId.value}`) {
    pendingDeleteSessionId.value = undefined
    dropped = true
  }
  if (confirmingFolderDelete.value && keep !== 'folder') {
    confirmingFolderDelete.value = false
    dropped = true
  }
  if (confirmingBatchDelete.value && keep !== 'batch') {
    confirmingBatchDelete.value = false
    dropped = true
  }
  return dropped
}

useEventListener(document, 'pointerdown', event => dropConfirmations(event.target), { capture: true })
useEventListener(document, 'focusin', (event) => {
  // A pointer press already ran the check on pointerdown. Only keyboard focus moves remain.
  if (event.target instanceof Element && event.target.matches(':focus-visible'))
    dropConfirmations(event.target)
})

function handleEscape(event: KeyboardEvent) {
  if (dropConfirmations(null)) {
    event.stopPropagation()
    return
  }
  if (expandedSessionId.value) {
    expandedSessionId.value = undefined
    event.stopPropagation()
    return
  }
  if (selecting.value) {
    selecting.value = false
    event.stopPropagation()
  }
}

const root = useTemplateRef<HTMLElement>('root')
const listBox = useTemplateRef<HTMLElement>('listBox')
/**
 * The most height that the list can take. The list grows with its rows until its surface, the drawer or the dialog,
 * reaches the maximum height of that surface. Then only the list scrolls. A surface without a maximum height, such as
 * the popover, leaves it unset.
 */
const listMaxHeight = shallowRef<number>()
const listMaxStyle = computed(() => listMaxHeight.value === undefined ? undefined : { maxHeight: `${listMaxHeight.value}px` })

function measureListRoom() {
  const surface = root.value?.closest<HTMLElement>('[role="dialog"]')
  if (!root.value || !surface || !listBox.value)
    return
  const surfaceMax = Number.parseFloat(getComputedStyle(surface).maxHeight)
  if (!Number.isFinite(surfaceMax)) {
    listMaxHeight.value = undefined
    return
  }
  // Content that does not fit counts too. In the dialog, a flex parent shrinks the list root, and its content sticks
  // out. In the drawer, a scroll container between the list and its surface hides it.
  let hidden = root.value.scrollHeight - root.value.clientHeight
  for (let element = root.value.parentElement; element && element !== surface; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowY
    if (overflow === 'auto' || overflow === 'scroll')
      hidden += element.scrollHeight - element.clientHeight
  }
  // Layout heights leave out the scale of an opening animation.
  const others = surface.offsetHeight + hidden - listBox.value.offsetHeight
  listMaxHeight.value = Math.max(0, Math.floor(surfaceMax - others))
}

// The children change size when the root does not, for example the batch actions in the dialog, where the root keeps
// the height of the dialog.
useResizeObserver(() => root.value
  ? [root.value, ...[...root.value.children].filter((child): child is HTMLElement => child instanceof HTMLElement)]
  : [], measureListRoom)
useEventListener(window, 'resize', measureListRoom)

const { holdLeavingItem } = useListReorderMotion({
  list: () => listBox.value?.querySelector('ul'),
  keys: () => visibleRows.value.map(row => row.meta.sessionId),
  keyOf: item => item.dataset.sessionKey,
  leaveActiveClass: 'session-item-leave-active',
})

// The character row scrolls sideways. A faded edge shows that more characters are there.
const { arrivedState, measure: measureChips } = useScroll(chips)
const chipsFade = computed(() => {
  const start = !arrivedState.left
  const end = !arrivedState.right
  if (start && end)
    return 'session-chips--fade-both'
  if (start)
    return 'session-chips--fade-start'
  if (end)
    return 'session-chips--fade-end'
  return undefined
})
useResizeObserver(chips, () => measureChips())
onMounted(() => measureChips())

const reducedMotion = usePreferredReducedMotion()

watch([characterChips, characterFilter], async () => {
  await nextTick()
  measureChips()
  chips.value?.querySelector('[aria-pressed="true"]')?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth',
  })
})

function chipClasses(pressed: boolean) {
  return [
    'shrink-0 inline-flex items-center gap-1.5 rounded-full active:scale-95',
    'transition-[color,background-color,transform] duration-200 motion-reduce:transition-none',
    'focus-visible:outline-2 focus-visible:outline-primary-500',
    props.compact ? 'h-7 text-xs' : 'h-8 text-sm',
    pressed
      ? 'bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900/60 dark:text-primary-200'
      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700/80',
  ]
}
</script>

<template>
  <div ref="root" :class="['min-h-0 flex flex-col']" @keydown.esc="handleEscape">
    <SessionsListHeader
      v-model:confirming-delete="confirmingFolderDelete"
      :place="place"
      :folders="props.folders"
      :current-folder="currentFolder"
      :live-count="liveRows.length"
      :archived-count="archivedCount"
      :folder-counts="folderCounts"
      :compact="props.compact"
      @select-place="setPlace"
      @create-folder="name => emit('createFolder', { name, sessionIds: [], open: true })"
      @rename-folder="emit('renameFolder', $event)"
      @delete-folder="emit('deleteFolder', $event)"
    />

    <div :class="['flex shrink-0 items-center']">
      <component
        :is="actionButtons.primary"
        v-bind="actionButtons.primaryProps"
        block
        size="unset"
        :data-session-confirm="selecting ? 'batch' : undefined"
        :disabled="selecting && selectedRows.length === 0"
        :loading="!selecting && isCreatingSession"
        @click="runPrimaryAction"
      >
        <Transition name="session-action-swap" mode="out-in">
          <span :key="primaryAction.key" :class="['min-w-0 max-w-full inline-flex items-center gap-2']">
            <span aria-hidden="true" :class="[primaryAction.icon, actionButtons.iconSize, 'shrink-0']" />
            <span :class="['truncate']">{{ primaryAction.label }}</span>
          </span>
        </Transition>
      </component>
      <Transition name="session-action-slot">
        <div v-if="selecting" :class="['shrink-0 overflow-hidden max-w-40', props.compact ? 'ml-0.5' : 'ml-2']">
          <component
            :is="actionButtons.secondary"
            v-bind="actionButtons.secondaryProps"
            size="unset"
            :class="props.compact
              ? ['h-9 whitespace-nowrap rounded-lg px-2 text-sm', 'focus-visible:outline-2 focus-visible:outline-primary-500']
              : ['h-12 whitespace-nowrap rounded-2xl px-4']"
            @click="toggleAllSelected"
          >
            {{ allSelected ? t('stage.chat.sessions.clear-selection') : t('stage.chat.sessions.select-all') }}
          </component>
        </div>
      </Transition>
      <component
        :is="actionButtons.secondary"
        v-bind="actionButtons.secondaryProps"
        size="unset"
        :aria-label="selecting ? t('stage.chat.sessions.done-selecting') : t('stage.chat.sessions.select')"
        :title="selecting ? t('stage.chat.sessions.done-selecting') : t('stage.chat.sessions.select')"
        :class="props.compact
          ? ['ml-0.5 size-9 shrink-0 rounded-lg text-neutral-400 hover:bg-neutral-500/10 hover:text-neutral-600 dark:hover:text-neutral-200', 'focus-visible:outline-2 focus-visible:outline-primary-500']
          : ['ml-2 size-12 shrink-0 rounded-2xl']"
        @click="selecting = !selecting"
      >
        <Transition name="session-action-swap" mode="out-in">
          <span :key="String(selecting)" aria-hidden="true" :class="[selecting ? 'i-mingcute:close-line' : 'i-mingcute:list-check-3-line', actionButtons.iconSize]" />
        </Transition>
      </component>
    </div>

    <!-- The character filter stays while selecting, so a selection can be made one character at a time. -->
    <div
      ref="chips"
      role="group"
      :aria-label="t('stage.chat.sessions.filter-by-character')"
      :class="['session-chips flex shrink-0 gap-1.5 overflow-x-auto scroll-px-6 p-0.5', props.compact ? 'mt-1' : 'mt-2.5', chipsFade]"
    >
      <button
        type="button"
        :aria-pressed="characterFilter === undefined"
        :class="[chipClasses(characterFilter === undefined), props.compact ? 'px-2.5' : 'px-3']"
        @click="chosenCharacterId = undefined"
      >
        {{ t('stage.chat.sessions.all') }}
        <span :class="['tabular-nums opacity-60']">{{ placeRows.length }}</span>
      </button>
      <button
        v-for="chip in characterChips"
        :key="chip.id"
        type="button"
        :aria-pressed="characterFilter === chip.id"
        :class="[chipClasses(characterFilter === chip.id), props.compact ? 'pl-1 pr-2.5' : 'pl-1 pr-3']"
        @click="chosenCharacterId = characterFilter === chip.id ? undefined : chip.id"
      >
        <Avatar
          :src="chip.preview"
          :class="[props.compact ? 'size-5' : 'size-6', 'block shrink-0 rounded-full bg-white text-neutral-400 dark:bg-neutral-700', '[&_[data-avatar-image]]:object-top']"
        >
          <template #fallback>
            <span aria-hidden="true" :class="['i-mingcute:user-3-line size-3.5']" />
          </template>
        </Avatar>
        <span :class="['max-w-24 truncate']">{{ chip.name }}</span>
        <span :class="['tabular-nums opacity-60']">{{ chip.count }}</span>
      </button>
    </div>

    <div v-if="props.compact" :class="['mb-1 mt-1.5 h-px shrink-0 bg-neutral-200/70 dark:bg-neutral-700/70']" />
    <!--
      The list grows with its rows until its surface reaches the maximum height of the surface. `AnimatedHeight` is the
      only place where the height animates. It sits inside the scroll area and clips its rows, so a row that moves or
      fades below the new end never counts as overflow, and the scroll area checks its overflow again when the height
      settles. Rows and the empty state are one keyed sequence: a row that stays slides to its new place, a new row or
      the empty state fades in where it lands, and an item that leaves fades out without holding space.
    -->
    <div ref="listBox" :class="['shrink-0', props.compact ? '' : 'mt-3']">
      <ScrollableArea :class="[props.compact ? 'max-h-[min(24rem,60dvh)]' : '']" :style="listMaxStyle">
        <AnimatedHeight>
          <!-- The padding keeps the focus rings of the rows inside the clip area. -->
          <div :class="[props.compact ? 'p-0.5' : 'p-1']">
            <TransitionGroup name="session-item" tag="ul" :class="['relative m-0 list-none p-0']" @before-leave="holdLeavingItem">
              <li
                v-if="visibleRows.length === 0"
                key="empty"
                :class="props.compact
                  ? ['flex items-center gap-2.5 px-2 py-2.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400']
                  : ['flex flex-col items-center gap-3 px-6 py-10 text-center text-sm leading-6 text-neutral-500 dark:text-neutral-400']"
              >
                <span
                  aria-hidden="true"
                  :class="[emptyState.icon, props.compact ? 'size-5 shrink-0 text-neutral-400 dark:text-neutral-500' : 'size-10 text-neutral-300 dark:text-neutral-600']"
                />
                <span :class="[props.compact ? '' : 'max-w-68']">{{ emptyState.text }}</span>
              </li>
              <li
                v-for="row in visibleRows"
                :key="row.meta.sessionId"
                :data-session-key="row.meta.sessionId"
                :class="[props.compact ? 'pb-0.5' : 'pb-2']"
              >
                <SessionRowItem
                  :swipe-open="expandedSessionId === row.meta.sessionId"
                  :row="row"
                  :folders="props.folders"
                  :compact="props.compact"
                  :selecting="selecting"
                  :selected="selectedIds.has(row.meta.sessionId)"
                  :show-folder="place.kind !== 'folder'"
                  :confirming-delete="pendingDeleteSessionId === row.meta.sessionId"
                  @update:swipe-open="expandedSessionId = $event ? row.meta.sessionId : undefined"
                  @select="selectSession(row.meta.sessionId)"
                  @toggle-selected="toggleSelected(row.meta.sessionId)"
                  @rename="title => emit('renameSession', { sessionId: row.meta.sessionId, title })"
                  @pin="pinned => emit('pinSession', { sessionId: row.meta.sessionId, pinned })"
                  @archive="archived => emit('archiveSessions', { sessionIds: [row.meta.sessionId], archived })"
                  @move="folderId => emit('moveSessions', { sessionIds: [row.meta.sessionId], folderId })"
                  @create-folder="name => emit('createFolder', { name, sessionIds: [row.meta.sessionId], open: false })"
                  @arm-delete="pendingDeleteSessionId = row.meta.sessionId"
                  @delete="deleteRow(row.meta.sessionId)"
                />
              </li>
            </TransitionGroup>
          </div>
        </AnimatedHeight>
      </ScrollableArea>
    </div>

    <!-- The batch actions rise from the bottom while selecting, so the controls above keep their places. -->
    <div
      :inert="!selecting"
      :class="[
        'grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        selecting ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      ]"
    >
      <div :class="['min-h-0 overflow-hidden']">
        <div
          :class="[
            'flex items-center gap-1 border-t border-neutral-200/70 text-neutral-500 dark:border-neutral-700/70 dark:text-neutral-400',
            props.compact ? 'mt-1 min-h-9 px-1 pt-1 text-xs' : 'mt-2 min-h-11 px-1 pt-2 text-sm',
          ]"
        >
          <span :class="['flex-1']">{{ t('stage.chat.sessions.selected', { count: selectedRows.length }) }}</span>
          <GhostButton
            size="unset"
            :disabled="selectedRows.length === 0"
            :class="['h-8 inline-flex items-center gap-1.5 rounded-lg px-2 text-neutral-700 hover:bg-neutral-500/10 dark:text-neutral-200', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
            @click="archiveSelected"
          >
            <span aria-hidden="true" :class="[place.kind === 'archive' ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line', 'size-4 shrink-0']" />
            {{ place.kind === 'archive' ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive') }}
          </GhostButton>
          <DropdownMenu v-model:open="batchMoveOpen" align="end" :side-offset="4" :content-class="['min-w-48 max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto']" :disabled="selectedRows.length === 0">
            <template #trigger>
              <GhostButton
                size="unset"
                :disabled="selectedRows.length === 0"
                :class="['h-8 inline-flex items-center gap-1.5 rounded-lg px-2 text-neutral-700 hover:bg-neutral-500/10 dark:text-neutral-200', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
              >
                <span aria-hidden="true" :class="['i-mingcute:folder-line size-4 shrink-0']" />
                {{ t('stage.chat.sessions.move-to-folder') }}
              </GhostButton>
            </template>
            <SessionFolderTargets
              :folders="props.folders"
              :current-folder-id="selectedFolderId"
              :in-folder="selectionInFolder"
              @move="moveSelected"
              @create="createFolderForSelection"
            />
          </DropdownMenu>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-primary-action :deep(.basic-button-content) {
  width: 100%;
  min-width: 0;
}
.session-primary-action--start :deep(.basic-button-content) {
  justify-content: flex-start;
}

.session-chips {
  scrollbar-width: none;
}
.session-chips::-webkit-scrollbar {
  display: none;
}
.session-chips--fade-start {
  mask-image: linear-gradient(to right, transparent, #000 1.75rem);
}
.session-chips--fade-end {
  mask-image: linear-gradient(to right, #000 calc(100% - 1.75rem), transparent);
}
.session-chips--fade-both {
  mask-image: linear-gradient(to right, transparent, #000 1.75rem, #000 calc(100% - 1.75rem), transparent);
}

.session-action-swap-enter-active,
.session-action-swap-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}
.session-action-swap-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.session-action-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* The slot grows from zero width, so the primary action shrinks beside it instead of jumping. */
.session-action-slot-enter-active,
.session-action-slot-leave-active {
  transition: max-width 220ms ease, margin 220ms ease, opacity 160ms ease;
}
.session-action-slot-enter-from,
.session-action-slot-leave-to {
  max-width: 0;
  margin-left: 0;
  opacity: 0;
}

/*
 * One keyed sequence with one height owner. A new item fades in where it lands. An item that leaves leaves the flow at
 * once and fades where it was. `useListReorderMotion` moves the rows that stay, with the timing of `AnimatedHeight`.
 */
.session-item-enter-active {
  transition:
    opacity 240ms cubic-bezier(0.16, 1, 0.3, 1) 70ms,
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1) 70ms;
}
.session-item-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.session-item-leave-active {
  position: absolute;
  right: 0;
  left: 0;
  transition: opacity 160ms ease-in;
  pointer-events: none;
}
.session-item-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .session-item-enter-active,
  .session-item-leave-active,
  .session-action-swap-enter-active,
  .session-action-swap-leave-active,
  .session-action-slot-enter-active,
  .session-action-slot-leave-active {
    transition: none;
  }
}
</style>
