<script setup lang="ts">
import type { ChatSessionsPlace } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { AnimatedHeight, BasicButton, Button, GhostButton, ScrollableArea } from '@proj-airi/ui'
import { useEventListener, useResizeObserver, watchDebounced } from '@vueuse/core'
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionRowItem from './session-row.vue'
import SessionsListHeader from './sessions-list-header.vue'
import SessionsSearchField from './sessions-search-field.vue'

import { useListReorderMotion } from '../composables/use-list-reorder-motion'
import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

const props = withDefaults(defineProps<{
  /** Every conversation of the user with the current character, archived ones included. */
  rows: SessionRow[]
  isCreatingSession: boolean
  /** The desktop popover. Rows are denser, and the list keeps a fixed maximum height. */
  compact?: boolean
  /** The list fills the height of its column and scrolls inside it, for example beside the chat of a desktop window. */
  fill?: boolean
  /** The character of the conversations. The title names it. See `SessionsListHeader`. */
  character?: { name: string }
  /** Compact rows for a touch screen, with swipe actions and a long-press menu. See `SessionRowItem`. */
  touch?: boolean
  /** The owner still reads stored messages for the search, so more rows can match. */
  searching?: boolean
}>(), {
  compact: false,
  fill: false,
  touch: false,
  searching: false,
})

const emit = defineEmits<{
  deleteSession: [sessionId: string]
  deleteSessions: [sessionIds: string[]]
  /** Creates a conversation with the current character. */
  newSession: []
  renameSession: [payload: { sessionId: string, title: string }]
  selectSession: [sessionId: string]
  pinSession: [payload: { sessionId: string, pinned: boolean }]
  archiveSessions: [payload: { sessionIds: string[], archived: boolean }]
  /** Opens the settings of the character of the list. */
  openCharacter: []
}>()

const { t } = useI18n()

/**
 * The place that the user chose. The owner can keep it after the list closes, so the list opens where the user left it.
 */
const chosenPlace = defineModel<ChatSessionsPlace>('place', { default: () => ({ kind: 'all' }) })
/**
 * The search of the list. While it has text, the owner passes only the conversations of the character that match it,
 * archived ones included, and the list shows them all, whatever the place.
 */
const query = defineModel<string>('query', { default: '' })
const searchActive = computed(() => query.value.trim() !== '')
// The field edits a draft. The search gets it when the typing pauses, so a long history is not scanned on each key.
const draftQuery = ref(query.value)
watchDebounced(draftQuery, (value) => {
  query.value = value
}, { debounce: 150 })
/** The search field takes the place of the title while it is open. A search that the owner keeps opens it. */
const searchOpen = shallowRef(query.value !== '')
const searchField = useTemplateRef<InstanceType<typeof SessionsSearchField>>('searchField')
const searchButton = useTemplateRef<HTMLButtonElement>('searchButton')
// The owner can clear the search, for example when the list closes. The field then closes too.
watch(query, (value) => {
  if (value === draftQuery.value)
    return
  draftQuery.value = value
  if (!value)
    searchOpen.value = false
})

async function openSearch() {
  searchOpen.value = true
  await nextTick()
  searchField.value?.focus()
}

/** Ends the search, so the list shows its place again, and gives focus back to the search button. */
async function closeSearch() {
  draftQuery.value = ''
  query.value = ''
  searchOpen.value = false
  await nextTick()
  searchButton.value?.focus()
}
// The swipe area that is open belongs to this open list, never to persisted session state.
const expandedSessionId = shallowRef<string>()
// Selection mode belongs to the open list owner, so closing the list can end it.
const selecting = defineModel<boolean>('selecting', { default: false })
const selectedIds = shallowRef(new Set<string>())
// The first press on the batch delete action only asks for confirmation, like the single-row delete.
const confirmingBatchDelete = shallowRef(false)

/** The place that the list shows. */
const place = computed(() => chosenPlace.value)

const liveRows = computed(() => props.rows.filter(row => row.meta.archivedAt === undefined))
const archivedCount = computed(() => props.rows.length - liveRows.value.length)

/** The rows that the list shows. Pinned conversations come first, and the rows already arrive in the order of their last message. */
const visibleRows = computed(() => {
  // Search results keep the order of their last message, so the newest match comes first.
  if (searchActive.value)
    return props.rows
  const rows = place.value.kind === 'archive' ? props.rows.filter(row => row.meta.archivedAt !== undefined) : liveRows.value
  return [...rows].sort((first, second) => Number(!!second.meta.pinnedAt) - Number(!!first.meta.pinnedAt))
})

// The selection survives a change of place. Only the rows that the list shows count and take a batch action.
const selectedRows = computed(() => visibleRows.value.filter(row => selectedIds.value.has(row.meta.sessionId)))
const allSelected = computed(() => visibleRows.value.length > 0 && selectedRows.value.length === visibleRows.value.length)

/** The state of the select-all control: every row, some rows, or no row of the list is selected. */
const selectionState = computed(() => {
  if (allSelected.value)
    return 'all'
  return selectedRows.value.length > 0 ? 'some' : 'none'
})

/**
 * The buttons of the action row. The popover shows plain buttons that fill on hover, and the drawer and the dialog show
 * filled buttons.
 */
const actionButtons = computed(() => {
  if (props.compact) {
    return {
      primary: BasicButton,
      primaryProps: {
        class: [
          'session-primary-action session-primary-action--start h-9 min-w-0 flex-1 rounded-lg px-2 text-sm outline-none',
          'text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/70',
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
      color: 'primary',
      variant: 'secondary',
      class: ['session-primary-action min-h-12 min-w-0 flex-1 rounded-2xl px-4 py-3'],
    },
    secondary: Button,
    secondaryProps: { color: 'neutral', variant: 'secondary' },
    iconSize: 'size-5',
  }
})

/** The buttons of the batch actions at the bottom: two equal halves, an icon and a label each. */
const batchButtonClasses = computed(() => [
  'min-w-0 flex-1 rounded-lg outline-none [&_.basic-button-content]:gap-1.5',
  props.compact ? 'h-9 text-sm' : 'h-11 text-base',
  'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]',
])

const emptyState = computed(() => {
  if (searchActive.value && props.searching)
    return { icon: 'i-mingcute:search-line', text: t('stage.chat.sessions.searching') }
  if (searchActive.value)
    return { icon: 'i-mingcute:search-line', text: t('stage.chat.sessions.search-empty', { query: query.value.trim() }) }
  if (place.value.kind === 'archive')
    return { icon: 'i-mingcute:archive-line', text: t('stage.chat.sessions.empty-archive') }
  return { icon: 'i-mingcute:chat-1-line', text: t('stage.chat.sessions.empty') }
})

watch(selectedIds, () => {
  confirmingBatchDelete.value = false
})

watch(selecting, (value) => {
  selectedIds.value = new Set()
  confirmingBatchDelete.value = false
  if (value) {
    expandedSessionId.value = undefined
  }
})

watch(place, () => {
  expandedSessionId.value = undefined
  confirmingBatchDelete.value = false
})

function setPlace(target: ChatSessionsPlace) {
  if (place.value.kind !== target.kind)
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

/** Deletes the selection. The first press only asks for confirmation, like the delete of one row. */
function deleteSelected() {
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

function selectSession(sessionId: string) {
  expandedSessionId.value = undefined
  emit('selectSession', sessionId)
}

function deleteRow(sessionId: string) {
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

// Cmd+F or Ctrl+F, the find shortcut of the browser, opens the search while the list is on screen.
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const command = event.metaKey || event.ctrlKey
  if (!command || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f' || !root.value?.isConnected)
    return
  event.preventDefault()
  void openSearch()
})
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
</script>

<template>
  <div ref="root" :class="['min-h-0 flex flex-col', props.fill ? 'h-full' : '']" @keydown.esc="handleEscape">
    <!-- A list that fills its column keeps its scrollbar at the edge of the column, so each part pads its own right side. -->
    <SessionsSearchField
      v-if="searchOpen"
      ref="searchField"
      v-model="draftQuery"
      :placeholder="t('stage.chat.sessions.search')"
      :close-label="t('stage.chat.sessions.search-close')"
      :compact="props.compact"
      :class="[props.compact ? 'mb-0.5' : 'mb-2', props.fill ? 'mr-2' : '']"
      @close="closeSearch"
    />
    <SessionsListHeader
      v-else
      :class="[props.fill ? 'pr-2' : '']"
      :place="place"
      :live-count="liveRows.length"
      :archived-count="archivedCount"
      :compact="props.compact"
      :character="props.character"
      @select-place="setPlace"
      @open-character="emit('openCharacter')"
    >
      <button
        ref="searchButton"
        type="button"
        data-testid="sessions-search-button"
        :aria-label="t('stage.chat.sessions.search')"
        :title="t('stage.chat.sessions.search')"
        :class="[iconButtonClasses, quietIconClasses, props.compact ? 'size-8' : 'size-11']"
        @click="openSearch"
      >
        <span aria-hidden="true" :class="['i-mingcute:search-line', props.compact ? 'size-4' : 'size-5']" />
      </button>
    </SessionsListHeader>

    <!--
      Outside selection, the row creates a conversation and starts selection. While selecting, it shows the select-all
      control with the count, in the column of the row checks, and Done. The actions on the selection are at the bottom.
    -->
    <div :class="['flex shrink-0 items-center', props.compact ? 'min-h-9' : 'min-h-12', props.fill ? 'pr-2' : '']">
      <Transition name="session-action-swap" mode="out-in">
        <div v-if="!selecting" key="actions" :class="['min-w-0 flex flex-1 items-center']">
          <component
            :is="actionButtons.primary"
            v-bind="actionButtons.primaryProps"
            block
            size="unset"
            :loading="isCreatingSession"
            @click="emit('newSession')"
          >
            <span :class="['min-w-0 max-w-full inline-flex items-center gap-2']">
              <span aria-hidden="true" :class="[props.compact ? 'i-mingcute:add-circle-line' : 'i-mingcute:edit-line', actionButtons.iconSize, 'shrink-0']" />
              <span :class="['truncate']">{{ t('stage.chat.sessions.new') }}</span>
            </span>
          </component>
          <component
            :is="actionButtons.secondary"
            v-bind="actionButtons.secondaryProps"
            size="unset"
            :aria-label="t('stage.chat.sessions.select')"
            :title="t('stage.chat.sessions.select')"
            :class="props.compact
              ? ['ml-0.5 size-9 shrink-0 rounded-lg text-neutral-400 hover:bg-neutral-500/10 hover:text-neutral-600 dark:hover:text-neutral-200', 'focus-visible:outline-2 focus-visible:outline-primary-500']
              : ['ml-2 size-12 shrink-0 rounded-2xl']"
            @click="selecting = true"
          >
            <span aria-hidden="true" :class="['i-mingcute:list-check-3-line', actionButtons.iconSize]" />
          </component>
        </div>
        <div v-else key="selection" :class="['min-w-0 flex flex-1 items-center gap-1']">
          <BasicButton
            size="unset"
            :aria-pressed="selectionState === 'all'"
            :aria-label="selectionState === 'all' ? t('stage.chat.sessions.clear-selection') : t('stage.chat.sessions.select-all')"
            :title="selectionState === 'all' ? t('stage.chat.sessions.clear-selection') : t('stage.chat.sessions.select-all')"
            :disabled="visibleRows.length === 0"
            :class="[
              'session-primary-action session-primary-action--start active:scale-100! min-w-0 flex-1 rounded-lg outline-none',
              'text-neutral-700 hover:bg-neutral-500/10 dark:text-neutral-200 [&_.basic-button-content]:gap-2.5',
              'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]',
              // The check stands in the column of the row checks.
              props.compact ? 'h-9 pl-2.5 pr-2 text-sm' : 'h-12 pl-4 pr-3 text-base',
            ]"
            @click="toggleAllSelected"
          >
            <span
              aria-hidden="true"
              :class="[
                'shrink-0',
                props.compact ? 'size-4' : 'size-5',
                selectionState === 'all'
                  ? 'i-mingcute:check-circle-fill text-primary-500'
                  : selectionState === 'some'
                    ? 'i-mingcute:minus-circle-fill text-primary-500'
                    : 'border-2 border-solid border-neutral-300 rounded-full dark:border-neutral-600',
              ]"
            />
            <span :class="['truncate']">{{ t('stage.chat.sessions.selected', { count: selectedRows.length }) }}</span>
          </BasicButton>
          <BasicButton
            size="unset"
            :class="[
              'shrink-0 rounded-lg font-medium outline-none',
              'text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/70',
              'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]',
              props.compact ? 'h-9 px-2.5 text-sm' : 'h-12 px-4 text-base',
            ]"
            @click="selecting = false"
          >
            {{ t('stage.chat.sessions.done-selecting') }}
          </BasicButton>
        </div>
      </Transition>
    </div>

    <div v-if="props.compact" :class="['mb-1 mt-1.5 h-px shrink-0 bg-neutral-200/70 dark:bg-neutral-700/70', props.fill ? 'mr-2' : '']" />
    <!--
      The list grows with its rows until its surface reaches the maximum height of the surface. `AnimatedHeight` is the
      only place where the height animates. It sits inside the scroll area and clips its rows, so a row that moves or
      fades below the new end never counts as overflow, and the scroll area checks its overflow again when the height
      settles. Rows and the empty state are one keyed sequence: a row that stays slides to its new place, a new row or
      the empty state fades in where it lands, and an item that leaves fades out without holding space.
    -->
    <!-- A drawer that closes on a drag leaves the rows alone, because a swipe on a row shows its actions. -->
    <div ref="listBox" :data-vaul-no-drag="props.touch ? '' : undefined" :class="[props.fill ? 'min-h-0 flex-1' : 'shrink-0', props.compact ? '' : 'mt-3']">
      <ScrollableArea :class="[props.fill ? 'h-full' : props.compact ? 'max-h-[min(24rem,60dvh)]' : '']" :style="listMaxStyle">
        <AnimatedHeight>
          <!-- The padding keeps the focus rings of the rows inside the clip area. -->
          <div :class="[props.fill ? 'py-0.5 pl-0.5 pr-2.5' : props.compact ? 'p-0.5' : 'p-1']">
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
                  :compact="props.compact"
                  :touch="props.touch"
                  :selecting="selecting"
                  :selected="selectedIds.has(row.meta.sessionId)"
                  @update:swipe-open="expandedSessionId = $event ? row.meta.sessionId : undefined"
                  @select="selectSession(row.meta.sessionId)"
                  @toggle-selected="toggleSelected(row.meta.sessionId)"
                  @rename="title => emit('renameSession', { sessionId: row.meta.sessionId, title })"
                  @pin="pinned => emit('pinSession', { sessionId: row.meta.sessionId, pinned })"
                  @archive="archived => emit('archiveSessions', { sessionIds: [row.meta.sessionId], archived })"
                  @delete="deleteRow(row.meta.sessionId)"
                />
              </li>
            </TransitionGroup>
          </div>
        </AnimatedHeight>
      </ScrollableArea>
    </div>

    <!--
      The batch actions rise from the bottom while selecting, so the controls above keep their places. Outside selection
      the collapsed bar stays mounted for its animation, so it leaves the accessibility tree too.
    -->
    <div
      :inert="!selecting"
      :aria-hidden="selecting ? undefined : 'true'"
      :class="[
        'grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        props.fill ? 'pr-2' : '',
        selecting ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      ]"
    >
      <div :class="['min-h-0 overflow-hidden']">
        <div
          :class="[
            'flex items-center gap-1 border-t border-neutral-200/70 dark:border-neutral-700/70',
            props.compact ? 'mt-1 pt-1' : 'mt-2 pt-2',
          ]"
        >
          <BasicButton
            size="unset"
            :disabled="selectedRows.length === 0"
            :class="[batchButtonClasses, 'text-neutral-700 hover:bg-neutral-500/10 dark:text-neutral-200']"
            @click="archiveSelected"
          >
            <span aria-hidden="true" :class="[place.kind === 'archive' ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line', 'size-4 shrink-0']" />
            {{ place.kind === 'archive' ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive') }}
          </BasicButton>
          <!-- The confirmation keeps the fill, as in the row menu. Bold text and a filled icon mark it. -->
          <BasicButton
            size="unset"
            data-session-confirm="batch"
            :disabled="selectedRows.length === 0"
            :class="[batchButtonClasses, 'text-red-500 hover:bg-neutral-500/10 dark:text-red-400', confirmingBatchDelete ? 'font-semibold' : '']"
            @click="deleteSelected"
          >
            <span aria-hidden="true" :class="[confirmingBatchDelete ? 'i-mingcute:delete-2-fill' : 'i-mingcute:delete-2-line', 'size-4 shrink-0']" />
            <!-- With nothing selected, the label leaves out the count: "Delete 0" reads as an action on zero chats. -->
            <template v-if="selectedRows.length === 0">
              {{ t('stage.chat.sessions.delete-short') }}
            </template>
            <template v-else>
              {{ confirmingBatchDelete
                ? t('stage.chat.sessions.confirm-delete-selected', selectedRows.length)
                : t('stage.chat.sessions.delete-selected', selectedRows.length) }}
            </template>
          </BasicButton>
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
  .session-action-swap-leave-active {
    transition: none;
  }
}
</style>
