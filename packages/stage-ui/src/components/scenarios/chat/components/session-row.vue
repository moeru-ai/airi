<script setup lang="ts">
import type { SessionRow } from './session-row-model'

import { isStageWeb } from '@proj-airi/stage-shared'
import { BasicButton, DropdownMenu, MenuItem, MenuSeparator, SwipeActionButton, SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
import { onLongPress } from '@vueuse/core'
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionNameField from './session-name-field.vue'
import SessionRowSummary from './session-row-summary.vue'

import { useMenuCloseAction } from '../composables/use-menu-close-action'
import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

const props = defineProps<{
  row: SessionRow
  compact: boolean
  /**
   * The compact row of a touch screen, for example in the side drawer of the phone. It shows no buttons. A swipe to the
   * left shows Archive and Delete, and a long press opens the menu, which also tells the full date of the last message.
   */
  touch?: boolean
  /** The list selects conversations for a batch action, so the row toggles its selection instead of opening. */
  selecting: boolean
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  toggleSelected: []
  rename: [title: string]
  pin: [pinned: boolean]
  archive: [archived: boolean]
  delete: []
}>()

/** The swipe area of the mobile row. The list keeps one row open at a time. */
const swipeOpen = defineModel<boolean>('swipeOpen', { default: false })

const { t } = useI18n()
const menuOpen = shallowRef(false)
const renaming = shallowRef(false)
const renameTitle = ref('')
// Rename starts when the menu has closed, so the menu does not move focus back to its trigger after the field opens.
const menuClose = useMenuCloseAction()
const rowRoot = useTemplateRef<HTMLElement>('rowRoot')
const nameField = useTemplateRef<InstanceType<typeof SessionNameField>>('nameField')

watch(() => props.selecting, (selecting) => {
  if (selecting)
    endRename(false)
})

const archived = computed(() => props.row.meta.archivedAt !== undefined)
const pinned = computed(() => !!props.row.meta.pinnedAt)
/**
 * The compact row of a pointer, for example in the popover or beside the chat of a desktop window. A swipe to the left,
 * for example with two fingers on a trackpad, shows Archive only. Its delete stays in the menu. A swipe to the right
 * shows Pin, which the menu also keeps. The mobile row and the touch row show Archive and Delete to the left.
 */
const compactPointer = computed(() => props.compact && !props.touch)
/**
 * The touch row opens its menu with a long press. The compact pointer row of the desktop app opens it with a right
 * click, so it shows no menu button either. Stage Web keeps the button on its pointer rows.
 */
const menuButtonHidden = computed(() => props.touch || (compactPointer.value && !isStageWeb()))
// NOTICE:
// In a 50px compact row, the swipe action surface sank below the middle and cut its label.
// `SwipeActionButton` sets a 44px minimum and an 8px inset, sized for 80px rows.
// Source: packages/ui/src/components/misc/swipe-action-button.vue (`min-h-11`, `py-2`).
// Remove these classes when the button has a compact size.
const compactActionSurface = computed(() => props.compact ? 'min-h-0!' : '')
const compactActionButton = computed(() => props.compact ? 'py-1!' : '')
/** The row clips its content for the swipe, which would cut a focus ring around its buttons, so the ring lies inside them. */
const insetFocusRing = 'focus-visible:outline-offset-[-2px]'

const mainButton = useTemplateRef<InstanceType<typeof BasicButton>>('mainButton')
// The press that opened the menu ends with a click on the row. That click must not open the conversation.
let longPressed = false
onLongPress(mainButton, () => {
  if (!props.touch || props.selecting)
    return
  longPressed = true
  menuOpen.value = true
}, { delay: 500, distanceThreshold: 10 })

/** A long press on a touch screen also opens the system menu. The row shows its own menu instead. */
function preventTouchMenu(event: Event) {
  if (props.touch)
    event.preventDefault()
}

function selectRow() {
  if (longPressed) {
    longPressed = false
    return
  }
  emit('select')
}
/**
 * The menu stays on screen while its close animation runs, and it keeps its trigger as its anchor. The trigger of the
 * compact row hides when the pointer leaves the row, so it stays until the menu has left. A hidden trigger has no
 * position, and the closing menu would jump to the corner of the window. The menu has left when it gives focus back.
 */
const menuShown = shallowRef(false)
watch(menuOpen, (open) => {
  if (open)
    menuShown.value = true
})

/**
 * The point of the right click that opened the menu. The menu opens at it, as the menu of a desktop app does. A menu
 * from its button or from the menu key has no point and opens at the button. The point stays until the menu has left,
 * so the closing menu stays where it was.
 */
const menuPoint = shallowRef<{ x: number, y: number }>()
const menuReference = computed(() => {
  const point = menuPoint.value
  return point ? { getBoundingClientRect: () => DOMRect.fromRect({ x: point.x, y: point.y, width: 0, height: 0 }) } : undefined
})

function onMenuCloseAutoFocus(event: Event) {
  menuShown.value = false
  menuPoint.value = undefined
  menuClose.onCloseAutoFocus(event)
}

/** A right click anywhere on the row of a pointer opens its menu at the pointer. The touch row uses a long press. */
function openMenuAtPointer(event: MouseEvent) {
  if (props.touch || renaming.value)
    return
  event.preventDefault()
  // The menu key reports no pointer position, so its menu opens at the button.
  menuPoint.value = event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : undefined
  menuOpen.value = true
}

/** The Delete item of the menu asks for a second press. It turns into its confirmation and keeps the menu open. */
const confirmingMenuDelete = shallowRef(false)
watch(menuOpen, (open) => {
  if (!open)
    confirmingMenuDelete.value = false
})

function selectDelete(event: Event) {
  if (confirmingMenuDelete.value) {
    emit('delete')
    return
  }
  event.preventDefault()
  confirmingMenuDelete.value = true
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
  if (value === 'pin')
    emit('pin', !pinned.value)
  else if (value === 'archive')
    emit('archive', !archived.value)
  else
    emit('delete')
}
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
      <SessionRowSummary :row="props.row" :compact="props.compact" :marks="false" />
    </BasicButton>

    <SwipeActionsRoot
      v-else
      v-slot="{ open, toggle }"
      v-model:open="swipeOpen"
      :disabled="renaming"
      @action="runSwipeAction"
    >
      <!--
        The swipe action buttons fit a row of 80px: a surface of at least 44px with a label below it. A compact row is
        50px high, so its actions show the icon only and the surface fills the row with an even inset. The accessible
        names stay.
      -->
      <SwipeActionsList v-if="compactPointer && !archived" side="start" :gap="16" default-action="pin">
        <SwipeActionsItem v-slot="{ takeover }" value="pin" as-child>
          <SwipeActionButton
            :label="pinned ? t('stage.chat.sessions.unpin') : t('stage.chat.sessions.pin')"
            :aria-label="pinned ? t('stage.chat.sessions.unpin') : t('stage.chat.sessions.pin')"
            :icon="pinned ? 'i-mingcute:pin-fill' : 'i-mingcute:pin-line'"
            :show-label="false"
            :surface-class="['bg-primary-500 text-white', compactActionSurface].join(' ')"
            :takeover="takeover"
            :class="['text-primary-600 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary-500 dark:text-primary-300', compactActionButton]"
          />
        </SwipeActionsItem>
      </SwipeActionsList>
      <SwipeActionsList :gap="16" :default-action="compactPointer ? 'archive' : 'delete'">
        <SwipeActionsItem v-slot="{ takeover }" value="archive" as-child>
          <SwipeActionButton
            :label="archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive')"
            :aria-label="archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive')"
            :icon="archived ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line'"
            :show-label="!props.compact"
            :surface-class="['bg-neutral-500 text-white', compactActionSurface].join(' ')"
            :takeover="takeover"
            :class="['text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-neutral-500 dark:text-neutral-300', compactActionButton]"
          />
        </SwipeActionsItem>
        <SwipeActionsItem v-if="!compactPointer" v-slot="{ takeover }" value="delete" as-child>
          <SwipeActionButton
            :label="t('stage.chat.sessions.delete-short')"
            :aria-label="t('stage.chat.sessions.delete')"
            icon="i-mingcute:delete-2-line"
            :show-label="!props.compact"
            :surface-class="['bg-red-500 text-white', compactActionSurface].join(' ')"
            :takeover="takeover"
            :class="['text-red-500 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-red-500', compactActionButton]"
          />
        </SwipeActionsItem>
      </SwipeActionsList>
      <SwipeActionsContent>
        <div
          :class="[
            'group relative flex items-center overflow-hidden',
            props.compact ? 'rounded-lg pr-0.5' : 'rounded-2xl pr-1',
            // The swipe actions lie under the row, so the touch row has a solid fill, the color of the drawer.
            // A compact row keeps its hover fill while its menu is on screen, because the open menu takes the pointer
            // and the user still sees which row the menu belongs to.
            props.row.isActive
              ? 'bg-primary-50/80 dark:bg-primary-950/80'
              : props.touch
                ? 'bg-neutral-50 dark:bg-neutral-900'
                : props.compact
                  ? menuShown ? 'bg-neutral-100/80 dark:bg-neutral-800/80' : 'bg-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80'
                  : 'bg-white dark:bg-neutral-800',
          ]"
          @contextmenu="openMenuAtPointer"
        >
          <div
            v-if="renaming"
            :class="['session-rename', props.compact ? 'min-h-12.5 gap-2 px-2 py-1.5' : 'min-h-20 gap-3 px-3 py-3', 'min-w-0 flex flex-1 items-center']"
          >
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
            ref="mainButton"
            data-session-main
            size="unset"
            :aria-current="props.row.isActive ? 'true' : undefined"
            :class="[
              'session-select active:scale-100! min-w-0 flex-1 text-left',
              props.compact ? 'min-h-12.5 rounded-lg px-2 py-1.5' : 'min-h-20 rounded-2xl px-3 py-3',
              // A long press opens the menu of the row, not the text selection or the link menu of the system.
              props.touch ? 'select-none [-webkit-touch-callout:none]' : '',
              'focus-visible:outline-2 focus-visible:outline-primary-500',
              insetFocusRing,
            ]"
            @click="selectRow"
            @contextmenu="preventTouchMenu"
          >
            <SessionRowSummary :row="props.row" :compact="props.compact" marks />
          </BasicButton>

          <template v-if="!renaming">
            <!--
              The compact row keeps Archive on the row, because it is the common action and an archived conversation comes
              back. A swipe to the left archives it too, and a swipe to the right pins it. Delete is in its menu, where the
              item turns into its own confirmation. The mobile row opens the swipe area, where Archive and Delete are the
              second press.
            -->
            <template v-if="compactPointer">
              <button
                type="button"
                :aria-label="`${archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive')}: ${props.row.preview}`"
                :title="archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive')"
                :class="[iconButtonClasses, insetFocusRing, quietIconClasses, 'size-8 hidden group-hover:inline-flex group-focus-within:inline-flex']"
                @click="emit('archive', !archived)"
              >
                <span aria-hidden="true" :class="[archived ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line', 'size-4']" />
              </button>
            </template>
            <button
              v-else-if="!props.compact"
              type="button"
              :aria-label="`${t('stage.chat.sessions.delete')}: ${props.row.preview}`"
              :title="t('stage.chat.sessions.delete')"
              :aria-expanded="open"
              :tabindex="open ? -1 : 0"
              :class="[iconButtonClasses, insetFocusRing, 'size-11 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400']"
              :style="{ opacity: 'calc(1 - var(--swipe-progress, 0))' }"
              @click="toggle()"
            >
              <span aria-hidden="true" :class="['i-mingcute:delete-2-line size-5']" />
            </button>

            <DropdownMenu
              v-model:open="menuOpen"
              :reference="menuReference"
              :align="menuPoint ? 'start' : 'end'"
              :side-offset="4"
              :content-class="['min-w-48 max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto']"
              @close-auto-focus="onMenuCloseAutoFocus"
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
                    insetFocusRing,
                    menuOpen ? 'text-primary-500 dark:text-primary-400' : quietIconClasses,
                    // A row without a menu button keeps its trigger for the keyboard and the screen reader. The trigger shows
                    // only with keyboard focus, and it gives the menu its place at the end of the row.
                    menuButtonHidden
                      ? 'pointer-events-none absolute right-1 top-1/2 size-8 -translate-y-1/2 opacity-0 focus-visible:opacity-100'
                      : props.compact
                        ? ['size-8', menuShown ? 'inline-flex' : 'hidden group-hover:inline-flex group-focus-within:inline-flex']
                        : 'size-11',
                  ]"
                  :style="props.compact ? undefined : { opacity: 'calc(1 - var(--swipe-progress, 0))' }"
                >
                  <span aria-hidden="true" :class="['i-mingcute:more-2-fill', props.compact ? 'size-4' : 'size-5']" />
                </button>
              </template>

              <MenuItem v-if="!archived" @select="emit('pin', !pinned)">
                <span aria-hidden="true" :class="[pinned ? 'i-mingcute:pin-fill' : 'i-mingcute:pin-line', 'size-4 shrink-0']" />
                {{ pinned ? t('stage.chat.sessions.unpin') : t('stage.chat.sessions.pin') }}
              </MenuItem>
              <MenuItem @select="requestRename">
                <span aria-hidden="true" :class="['i-mingcute:edit-2-line size-4 shrink-0']" />
                {{ t('stage.chat.sessions.rename-short') }}
              </MenuItem>
              <MenuItem v-if="props.touch" @select="emit('archive', !archived)">
                <span aria-hidden="true" :class="[archived ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line', 'size-4 shrink-0']" />
                {{ archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive') }}
              </MenuItem>
              <MenuSeparator />
              <MenuItem v-if="props.compact" :class="['text-red-500 dark:text-red-400']" @select="selectDelete">
                <span aria-hidden="true" :class="[confirmingMenuDelete ? 'i-mingcute:delete-2-fill' : 'i-mingcute:delete-2-line', 'size-4 shrink-0']" />
                {{ confirmingMenuDelete ? t('stage.chat.sessions.confirm-delete-short') : t('stage.chat.sessions.delete-short') }}
              </MenuItem>
              <MenuItem v-else @select="emit('archive', !archived)">
                <span aria-hidden="true" :class="[archived ? 'i-mingcute:unarchive-line' : 'i-mingcute:archive-line', 'size-4 shrink-0']" />
                {{ archived ? t('stage.chat.sessions.unarchive') : t('stage.chat.sessions.archive') }}
              </MenuItem>
              <!-- The touch row has no tooltip for the full date of its time, so its menu tells it. -->
              <p v-if="props.touch" :class="['m-0 px-2 pb-1 pt-1.5 text-xs text-neutral-400 dark:text-neutral-500']">
                {{ props.row.activityAtTitle }}
              </p>
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
