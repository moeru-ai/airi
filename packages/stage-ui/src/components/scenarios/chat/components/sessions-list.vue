<script setup lang="ts">
import type { ChatSessionFolder, ChatSessionsPlace } from '../../../../types/chat-session'
import type { SessionRow } from './session-row.vue'

import { AnimatedHeight, Avatar, BasicButton, Button, DropdownMenu, GhostButton, Input, MenuItem, MenuLabel, MenuSeparator, ScrollableArea } from '@proj-airi/ui'
import { useEventListener, usePreferredReducedMotion, useResizeObserver, useScroll } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionFolderTargets from './session-folder-targets.vue'
import SessionMenuNewFolder from './session-menu-new-folder.vue'
import SessionRowItem from './session-row.vue'

import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

const props = withDefaults(defineProps<{
  /** Every conversation of the user, archived ones included. */
  rows: SessionRow[]
  /** Every character of the user. The filter offers each one, also one without conversations, so a first conversation can go to it. */
  characters: Array<{ id: string, name: string, preview?: string }>
  folders: ChatSessionFolder[]
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
  /** Creates a folder, then moves the conversations into it. */
  createFolder: [payload: { name: string, sessionIds: string[] }]
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
const placeMenuOpen = shallowRef(false)
const folderMenuOpen = shallowRef(false)
const batchMoveOpen = shallowRef(false)
const confirmingFolderDelete = shallowRef(false)
const renamingFolder = shallowRef(false)
const folderName = ref('')
// Folder rename starts when the folder menu has closed, so the menu does not move focus back to its trigger.
let renameFolderRequested = false
/** The folders before a folder was created from the place menu. The new folder opens when the store adds it. */
let foldersBeforeCreate: Set<string> | undefined

const placeTrigger = useTemplateRef<HTMLElement>('placeTrigger')
const folderRenameGroup = useTemplateRef<HTMLElement>('folderRenameGroup')
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

  const result = new Map<string, { id: string, name: string, preview?: string, count: number }>()
  for (const character of props.characters)
    result.set(character.id, { ...character, count: counts.get(character.id) ?? 0 })
  // A conversation can belong to a character that this device does not have. Its rows name the character.
  for (const row of props.rows) {
    const id = row.meta.characterId
    if (!result.has(id))
      result.set(id, { id, name: row.characterName, preview: row.characterPreview, count: counts.get(id) ?? 0 })
  }
  return [...result.values()]
})

/** The character that the filter applies. A chosen character that no longer exists applies no filter. */
const characterFilter = computed(() => characterChips.value.some(chip => chip.id === chosenCharacterId.value)
  ? chosenCharacterId.value
  : undefined)

/** The name of the filtered character. The empty state names it. */
const filteredCharacterName = computed(() => characterChips.value.find(chip => chip.id === characterFilter.value)?.name)
/**
 * The filtered character when this device has its card. A new conversation goes to it, and the primary action names
 * it. A character without a card cannot send, so a new conversation under its filter goes to the default character.
 */
const newSessionCharacter = computed(() => props.characters.find(character => character.id === characterFilter.value))

/** The rows that the list shows. Pinned conversations come first, and the rows already arrive in the order of their last message. */
const visibleRows = computed(() => {
  const rows = placeRows.value.filter(row => characterFilter.value === undefined || row.meta.characterId === characterFilter.value)
  if (place.value.kind === 'archive')
    return rows
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

const placeLabel = computed(() => {
  if (place.value.kind === 'archive')
    return t('stage.chat.sessions.archived')
  if (place.value.kind === 'folder')
    return currentFolder.value?.name ?? ''
  return t('stage.chat.sessions.all-conversations')
})
const placeIcon = computed(() => {
  if (place.value.kind === 'archive')
    return 'i-mingcute:archive-line'
  if (place.value.kind === 'folder')
    return 'i-mingcute:folder-line'
  return undefined
})

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

const emptyState = computed(() => {
  const name = filteredCharacterName.value
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
  renamingFolder.value = false
})

watch(() => props.folders, (folders) => {
  const before = foldersBeforeCreate
  if (!before)
    return
  const created = folders.find(folder => !before.has(folder.id))
  if (!created)
    return
  foldersBeforeCreate = undefined
  chosenPlace.value = { kind: 'folder', folderId: created.id }
})

function isPlace(target: ChatSessionsPlace) {
  const current = place.value
  if (current.kind === 'folder' && target.kind === 'folder')
    return current.folderId === target.folderId
  return current.kind === target.kind
}

function setPlace(target: ChatSessionsPlace) {
  foldersBeforeCreate = undefined
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
  const name = newSessionCharacter.value?.name
  if (folder !== undefined) {
    return name === undefined
      ? t('stage.chat.sessions.new-in-folder', { folder })
      : t('stage.chat.sessions.new-in-folder-with-character', { folder, name })
  }
  return name === undefined ? t('stage.chat.sessions.new') : t('stage.chat.sessions.new-with-character', { name })
}

function runPrimaryAction() {
  if (!selecting.value) {
    emit('newSession', { folderId: currentFolder.value?.id, characterId: newSessionCharacter.value?.id })
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
  emit('createFolder', { name, sessionIds })
  selecting.value = false
}

function createFolderFromPlaceMenu(name: string) {
  placeMenuOpen.value = false
  foldersBeforeCreate = new Set(props.folders.map(folder => folder.id))
  emit('createFolder', { name, sessionIds: [] })
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

function pressFolderDelete() {
  if (!confirmingFolderDelete.value) {
    confirmingFolderDelete.value = true
    return
  }
  confirmingFolderDelete.value = false
  if (currentFolder.value)
    emit('deleteFolder', currentFolder.value.id)
}

function requestFolderRename() {
  renameFolderRequested = true
}

async function openFolderRenameAfterMenu(event: Event) {
  if (!renameFolderRequested || !currentFolder.value)
    return
  renameFolderRequested = false
  event.preventDefault()
  folderName.value = currentFolder.value.name
  renamingFolder.value = true
  await nextTick()
  const input = folderRenameGroup.value?.querySelector('input')
  input?.focus()
  input?.select()
}

function saveFolderName() {
  if (!renamingFolder.value)
    return
  if (currentFolder.value && folderName.value.trim())
    emit('renameFolder', { folderId: currentFolder.value.id, name: folderName.value })
  renamingFolder.value = false
}

/** Enter, Escape, Save, and Cancel return focus to the title, so the keyboard user continues from it. */
async function finishFolderRename(save: boolean) {
  if (save)
    saveFolderName()
  else
    renamingFolder.value = false
  await nextTick()
  placeTrigger.value?.focus()
}

/** Focus that leaves the name field and its buttons saves a name. An empty field keeps the old name. */
function handleFolderRenameFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && folderRenameGroup.value?.contains(event.relatedTarget))
    return
  saveFolderName()
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

/**
 * An item that leaves keeps the place where it was while it fades. It leaves the flow at once, so the items after it
 * slide up. Without a fixed top, items that leave together would share the place of the first one.
 */
function holdLeavingItem(element: Element) {
  if (element instanceof HTMLElement)
    element.style.top = `${element.offsetTop}px`
}

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

/** The order of the visible rows. It keeps its identity while the order stays, so an update of row data moves nothing. */
const visibleKeys = computed<string[]>((previous) => {
  const next = visibleRows.value.map(row => row.meta.sessionId)
  return previous && previous.length === next.length && previous.every((key, index) => key === next[index]) ? previous : next
})

/**
 * Rows that stay slide from where they are to where they land. The list moves them itself: the store can update the
 * rows several times right after one action, and `TransitionGroup` cancels a running move on each update without
 * starting it again, so the row jumps. Only a change of the order starts a move here, from the place where the row is
 * at that moment.
 */
const rowMoves = new WeakMap<HTMLElement, Animation>()
let rowTopsBefore = new Map<string, number>()

function rowItems() {
  const list = listBox.value?.querySelector('ul')
  const items = [...list?.children ?? []].filter((item): item is HTMLElement =>
    item instanceof HTMLElement && item.dataset.sessionKey !== undefined && !item.classList.contains('session-item-leave-active'))
  return { list, items }
}

watch(visibleKeys, () => {
  const { list, items } = rowItems()
  rowTopsBefore = new Map()
  if (!list)
    return
  const listTop = list.getBoundingClientRect().top
  for (const item of items)
    rowTopsBefore.set(item.dataset.sessionKey!, item.getBoundingClientRect().top - listTop)
}, { flush: 'pre' })

watch(visibleKeys, () => {
  if (reducedMotion.value === 'reduce')
    return
  for (const item of rowItems().items) {
    const before = rowTopsBefore.get(item.dataset.sessionKey!)
    if (before === undefined)
      continue
    // The place before includes a running move. The layout offset does not, so the new move starts where the row is.
    const offset = before - item.offsetTop
    rowMoves.get(item)?.cancel()
    if (Math.abs(offset) < 0.5)
      continue
    rowMoves.set(item, item.animate(
      [{ transform: `translateY(${offset}px)` }, { transform: 'none' }],
      { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    ))
  }
}, { flush: 'post' })

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
const confirmPillClasses = computed(() => [
  'session-confirm-pill shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-full outline-none',
  'bg-red-500/10 font-semibold text-red-500 dark:text-red-400',
  'focus-visible:outline-2 focus-visible:outline-red-500',
  props.compact ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
])
const menuCountClasses = ['ml-auto pl-3 text-xs tabular-nums text-neutral-400 dark:text-neutral-500']
const menuCheckClasses = ['i-mingcute:check-line size-4 shrink-0 text-primary-500']
</script>

<template>
  <div ref="root" :class="['min-h-0 flex flex-col']" @keydown.esc="handleEscape">
    <!-- The title is the place switcher. A folder adds its delete button and its menu. -->
    <div :class="['flex shrink-0 items-center gap-0.5', props.compact ? 'mb-0.5 min-h-8' : 'mb-2 min-h-11']">
      <div
        v-if="renamingFolder"
        ref="folderRenameGroup"
        :class="['min-w-0 flex flex-1 items-center gap-0.5']"
        @focusout="handleFolderRenameFocusOut"
      >
        <Input
          v-model="folderName"
          :aria-label="t('stage.chat.sessions.folder-name')"
          :placeholder="t('stage.chat.sessions.folder-name-placeholder')"
          @keydown.enter.stop.prevent="finishFolderRename(true)"
          @keydown.esc.stop="finishFolderRename(false)"
        />
        <!-- The buttons keep focus in the field on press, so leaving focus does not save before Cancel runs. -->
        <button
          type="button"
          :aria-label="t('stage.chat.sessions.save-folder')"
          :title="t('stage.chat.sessions.save-folder')"
          :class="[iconButtonClasses, props.compact ? 'size-8' : 'size-9', 'text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300']"
          @pointerdown.prevent
          @click="finishFolderRename(true)"
        >
          <span aria-hidden="true" :class="['i-mingcute:check-line', props.compact ? 'size-4' : 'size-5']" />
        </button>
        <button
          type="button"
          :aria-label="t('stage.chat.sessions.cancel-folder')"
          :title="t('stage.chat.sessions.cancel-folder')"
          :class="[iconButtonClasses, props.compact ? 'size-8' : 'size-9', quietIconClasses]"
          @pointerdown.prevent
          @click="finishFolderRename(false)"
        >
          <span aria-hidden="true" :class="['i-mingcute:close-line', props.compact ? 'size-4' : 'size-5']" />
        </button>
      </div>
      <template v-else>
        <DropdownMenu v-model:open="placeMenuOpen" align="start" :side-offset="4" content-class="min-w-56 max-w-72">
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
          <MenuItem @select="setPlace({ kind: 'all' })">
            <span aria-hidden="true" :class="['i-mingcute:chat-2-line size-4 shrink-0']" />
            <span :class="['min-w-0 truncate']">{{ t('stage.chat.sessions.all-conversations') }}</span>
            <span :class="menuCountClasses">{{ liveRows.length }}</span>
            <span v-if="place.kind === 'all'" aria-hidden="true" :class="menuCheckClasses" />
          </MenuItem>
          <MenuLabel>{{ t('stage.chat.sessions.folders') }}</MenuLabel>
          <MenuItem
            v-for="folder in props.folders"
            :key="folder.id"
            @select="setPlace({ kind: 'folder', folderId: folder.id })"
          >
            <span aria-hidden="true" :class="['i-mingcute:folder-line size-4 shrink-0']" />
            <span :class="['min-w-0 truncate']">{{ folder.name }}</span>
            <span :class="menuCountClasses">{{ folderCounts.get(folder.id) ?? 0 }}</span>
            <span v-if="place.kind === 'folder' && place.folderId === folder.id" aria-hidden="true" :class="menuCheckClasses" />
          </MenuItem>
          <SessionMenuNewFolder @create="createFolderFromPlaceMenu" />
          <MenuSeparator />
          <MenuItem @select="setPlace({ kind: 'archive' })">
            <span aria-hidden="true" :class="['i-mingcute:archive-line size-4 shrink-0']" />
            <span :class="['min-w-0 truncate']">{{ t('stage.chat.sessions.archived') }}</span>
            <span :class="menuCountClasses">{{ archivedCount }}</span>
            <span v-if="place.kind === 'archive'" aria-hidden="true" :class="menuCheckClasses" />
          </MenuItem>
        </DropdownMenu>
        <span :class="['flex-1']" />
        <template v-if="currentFolder">
          <!-- Deleting a folder keeps its conversations. The button turns into its confirmation in place. -->
          <button
            type="button"
            data-session-confirm="folder"
            :aria-label="confirmingFolderDelete ? t('stage.chat.sessions.confirm-delete-folder') : t('stage.chat.sessions.delete-folder')"
            :title="confirmingFolderDelete ? t('stage.chat.sessions.confirm-delete-folder') : t('stage.chat.sessions.delete-folder')"
            :class="confirmingFolderDelete
              ? confirmPillClasses
              : [iconButtonClasses, props.compact ? 'size-8' : 'size-10', 'text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400']"
            @click="pressFolderDelete"
          >
            <span aria-hidden="true" :class="[confirmingFolderDelete ? 'i-mingcute:delete-2-fill size-3.5' : ['i-mingcute:delete-2-line', props.compact ? 'size-4' : 'size-5']]" />
            <template v-if="confirmingFolderDelete">
              {{ t('stage.chat.sessions.confirm-delete-folder') }}
            </template>
          </button>
          <DropdownMenu
            v-model:open="folderMenuOpen"
            align="end"
            :side-offset="4"
            @close-auto-focus="openFolderRenameAfterMenu"
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
            <MenuItem @select="requestFolderRename">
              <span aria-hidden="true" :class="['i-mingcute:edit-2-line size-4 shrink-0']" />
              {{ t('stage.chat.sessions.rename-folder') }}
            </MenuItem>
          </DropdownMenu>
        </template>
      </template>
    </div>

    <div :class="['flex shrink-0 items-center']">
      <BasicButton
        v-if="props.compact"
        block
        size="unset"
        :data-session-confirm="selecting ? 'batch' : undefined"
        :disabled="selecting && selectedRows.length === 0"
        :loading="!selecting && isCreatingSession"
        :class="[
          'session-primary-action session-primary-action--start h-9 min-w-0 flex-1 rounded-lg px-2 text-sm outline-none',
          selecting
            ? ['text-red-500 hover:bg-red-500/10 dark:text-red-400', confirmingBatchDelete ? 'bg-red-500/10' : '']
            : 'text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/70',
          'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]',
        ]"
        @click="runPrimaryAction"
      >
        <Transition name="session-action-swap" mode="out-in">
          <span :key="primaryAction.key" :class="['min-w-0 max-w-full inline-flex items-center gap-2']">
            <span aria-hidden="true" :class="[primaryAction.icon, 'size-4.5 shrink-0']" />
            <span :class="['truncate']">{{ primaryAction.label }}</span>
          </span>
        </Transition>
      </BasicButton>
      <Button
        v-else
        block
        :data-session-confirm="selecting ? 'batch' : undefined"
        :color="selecting ? 'red' : 'primary'"
        :variant="confirmingBatchDelete ? 'primary' : 'secondary'"
        size="unset"
        :disabled="selecting && selectedRows.length === 0"
        :loading="!selecting && isCreatingSession"
        :class="['session-primary-action min-h-12 min-w-0 flex-1 rounded-2xl px-4 py-3']"
        @click="runPrimaryAction"
      >
        <Transition name="session-action-swap" mode="out-in">
          <span :key="primaryAction.key" :class="['min-w-0 max-w-full inline-flex items-center gap-2']">
            <span aria-hidden="true" :class="[primaryAction.icon, 'size-5 shrink-0']" />
            <span :class="['truncate']">{{ primaryAction.label }}</span>
          </span>
        </Transition>
      </Button>
      <Transition name="session-action-slot">
        <div v-if="selecting" :class="['shrink-0 overflow-hidden max-w-40', props.compact ? 'ml-0.5' : 'ml-2']">
          <GhostButton
            v-if="props.compact"
            size="unset"
            :class="['h-9 whitespace-nowrap rounded-lg px-2 text-sm', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
            @click="toggleAllSelected"
          >
            {{ allSelected ? t('stage.chat.sessions.clear-selection') : t('stage.chat.sessions.select-all') }}
          </GhostButton>
          <Button
            v-else
            color="neutral" variant="secondary" size="unset"
            :class="['h-12 whitespace-nowrap rounded-2xl px-4']"
            @click="toggleAllSelected"
          >
            {{ allSelected ? t('stage.chat.sessions.clear-selection') : t('stage.chat.sessions.select-all') }}
          </Button>
        </div>
      </Transition>
      <GhostButton
        v-if="props.compact"
        size="unset"
        :aria-label="selecting ? t('stage.chat.sessions.done-selecting') : t('stage.chat.sessions.select')"
        :title="selecting ? t('stage.chat.sessions.done-selecting') : t('stage.chat.sessions.select')"
        :class="['ml-0.5 size-9 shrink-0 rounded-lg text-neutral-400 hover:bg-neutral-500/10 hover:text-neutral-600 dark:hover:text-neutral-200', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
        @click="selecting = !selecting"
      >
        <Transition name="session-action-swap" mode="out-in">
          <span :key="String(selecting)" aria-hidden="true" :class="[selecting ? 'i-mingcute:close-line' : 'i-mingcute:list-check-3-line', 'size-4.5']" />
        </Transition>
      </GhostButton>
      <Button
        v-else
        color="neutral" variant="secondary" size="unset"
        :aria-label="selecting ? t('stage.chat.sessions.done-selecting') : t('stage.chat.sessions.select')"
        :title="selecting ? t('stage.chat.sessions.done-selecting') : t('stage.chat.sessions.select')"
        :class="['ml-2 size-12 shrink-0 rounded-2xl']"
        @click="selecting = !selecting"
      >
        <Transition name="session-action-swap" mode="out-in">
          <span :key="String(selecting)" aria-hidden="true" :class="[selecting ? 'i-mingcute:close-line' : 'i-mingcute:list-check-3-line', 'size-5']" />
        </Transition>
      </Button>
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
                  @create-folder="name => emit('createFolder', { name, sessionIds: [row.meta.sessionId] })"
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
          <DropdownMenu v-model:open="batchMoveOpen" align="end" :side-offset="4" content-class="min-w-48" :disabled="selectedRows.length === 0">
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

.session-confirm-pill {
  animation: session-confirm-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes session-confirm-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
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
 * once and fades where it was. The script moves the rows that stay, with the timing of `AnimatedHeight`.
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
  .session-confirm-pill {
    animation: none;
  }
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
