<script lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'

import { BasicButton, Button, GhostButton, Input, ScrollableArea, SwipeActionButton, SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/** A conversation preview prepared by the session owner for either dialog surface. */
export interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  isActive: boolean
  activityAtLabel: string
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  rows: SessionRow[]
  isCreatingSession: boolean
  compact?: boolean
}>(), {
  compact: false,
})

const emit = defineEmits<{
  configureSession: [sessionId: string]
  deleteSession: [sessionId: string]
  deleteSessions: [sessionIds: string[]]
  newSession: []
  renameSession: [payload: { sessionId: string, title: string }]
  selectSession: [sessionId: string]
}>()

const { t } = useI18n()
// The expanded row belongs to this open list, never to persisted session state.
const expandedSessionId = shallowRef<string>()
const pendingDeleteSessionId = shallowRef<string>()
const renamingSessionId = shallowRef<string>()
const renameTitle = ref('')
// Selection mode belongs to the open list owner, so closing the list can end it.
const selecting = defineModel<boolean>('selecting', { default: false })
const selectedIds = shallowRef(new Set<string>())
// Rows can disappear while selecting, for example after a delete in another window, so only listed rows count.
const selectedRows = computed(() => props.rows.filter(row => selectedIds.value.has(row.meta.sessionId)))
const allSelected = computed(() => props.rows.length > 0 && selectedRows.value.length === props.rows.length)
// The first press on the batch delete action only asks for confirmation, like the single-row delete.
const confirmingBatchDelete = shallowRef(false)
/** The primary action creates a conversation, or deletes the selection while selecting. */
const primaryAction = computed(() => {
  if (!selecting.value) {
    return {
      key: 'new',
      icon: props.compact ? 'i-solar:add-circle-outline' : 'i-solar:pen-new-square-outline',
      label: t('stage.chat.sessions.new'),
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

watch(selectedIds, () => {
  confirmingBatchDelete.value = false
})

watch(selecting, (value) => {
  selectedIds.value = new Set()
  confirmingBatchDelete.value = false
  if (!value)
    return
  pendingDeleteSessionId.value = undefined
  expandedSessionId.value = undefined
  cancelRename()
})

function toggleSelected(sessionId: string) {
  const next = new Set(selectedIds.value)
  if (!next.delete(sessionId))
    next.add(sessionId)
  selectedIds.value = next
}

function toggleAllSelected() {
  selectedIds.value = allSelected.value ? new Set() : new Set(props.rows.map(row => row.meta.sessionId))
}

function deleteSelected() {
  const sessionIds = selectedRows.value.map(row => row.meta.sessionId)
  if (sessionIds.length === 0)
    return

  emit('deleteSessions', sessionIds)
  selecting.value = false
}

function runPrimaryAction() {
  if (!selecting.value) {
    emit('newSession')
    return
  }
  if (!confirmingBatchDelete.value) {
    confirmingBatchDelete.value = true
    return
  }
  deleteSelected()
}

function selectSession(sessionId: string) {
  pendingDeleteSessionId.value = undefined
  renamingSessionId.value = undefined
  emit('selectSession', sessionId)
}

function startRename(row: SessionRow) {
  pendingDeleteSessionId.value = undefined
  renamingSessionId.value = row.meta.sessionId
  renameTitle.value = row.meta.title ?? row.preview
}

function cancelRename() {
  renamingSessionId.value = undefined
  renameTitle.value = ''
}

function commitRename(row: SessionRow) {
  if (renamingSessionId.value !== row.meta.sessionId)
    return

  emit('renameSession', { sessionId: row.meta.sessionId, title: renameTitle.value })
  cancelRename()
}

function handleEscape() {
  selecting.value = false
  pendingDeleteSessionId.value = undefined
  cancelRename()
}

function deleteDesktopSession(sessionId: string) {
  if (pendingDeleteSessionId.value !== sessionId) {
    pendingDeleteSessionId.value = sessionId
    return
  }

  pendingDeleteSessionId.value = undefined
  emit('deleteSession', sessionId)
}
</script>

<template>
  <div :class="['min-h-0 flex flex-col', props.compact ? 'gap-0' : 'gap-4']">
    <div :class="['flex shrink-0 items-center']">
      <BasicButton
        v-if="props.compact"
        block
        size="unset"
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
      <template v-if="rows.length > 0 || selecting">
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
      </template>
    </div>
    <div v-if="props.compact" :class="['my-1 h-px shrink-0 bg-neutral-200/70 dark:bg-neutral-700/70']" />
    <ScrollableArea
      :class="['min-h-0', props.compact ? 'max-h-[min(24rem,60dvh)]' : 'max-h-[calc(80dvh-12rem)]']"
      :viewport-class="props.compact ? ['p-0.5'] : ['p-1']"
    >
      <div v-if="rows.length === 0" :class="[props.compact ? 'min-h-24' : 'min-h-40', 'flex flex-col items-center justify-center gap-3 text-sm text-neutral-500 dark:text-neutral-400']">
        <span aria-hidden="true" :class="['i-solar:dialog-2-outline size-8 text-neutral-400']" />
        {{ t('stage.chat.sessions.empty') }}
      </div>
      <TransitionGroup v-else name="session-row" tag="ul" :class="['m-0 list-none p-0', props.compact ? 'space-y-0.5' : 'space-y-2']">
        <li
          v-for="row in rows"
          :key="row.meta.sessionId"
          :class="['overflow-hidden', props.compact ? 'rounded-lg' : 'rounded-2xl']"
          @mouseleave="props.compact && (pendingDeleteSessionId = undefined)"
          @keydown.esc.stop="handleEscape"
        >
          <BasicButton
            v-if="selecting"
            size="unset"
            :aria-pressed="selectedIds.has(row.meta.sessionId)"
            :class="[
              'session-select active:scale-100! w-full min-w-0 text-left',
              props.compact ? 'min-h-12 rounded-lg px-2 py-1.5' : 'min-h-20 rounded-2xl px-3 py-3',
              selectedIds.has(row.meta.sessionId)
                ? 'bg-primary-50/80 dark:bg-primary-950/80'
                : props.compact ? 'bg-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80' : 'bg-white dark:bg-neutral-800',
              'focus-visible:outline-2 focus-visible:outline-primary-500',
            ]"
            @click="toggleSelected(row.meta.sessionId)"
          >
            <span
              aria-hidden="true"
              :class="[
                'shrink-0',
                props.compact ? 'size-4' : 'size-5',
                selectedIds.has(row.meta.sessionId)
                  ? 'i-mingcute:check-circle-fill text-primary-500'
                  : 'border-2 border-solid border-neutral-300 rounded-full dark:border-neutral-600',
              ]"
            />
            <span :class="['min-w-0 flex-1']">
              <span :class="['block truncate text-sm font-medium']">{{ row.preview }}</span>
              <span :class="['flex items-center gap-2 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
                <span>{{ row.activityAtLabel }}</span>
                <span v-if="row.isActive" :class="['text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
                <span v-if="row.meta.cloudChatId" role="img" :aria-label="t('stage.chat.sessions.cloud-badge')" :title="t('stage.chat.sessions.cloud-badge')" :class="['i-solar:cloud-check-outline size-4 shrink-0']" />
              </span>
            </span>
          </BasicButton>
          <div
            v-else-if="props.compact"
            :class="[
              'group flex items-center overflow-hidden rounded-lg pr-0.5',
              row.isActive
                ? 'bg-primary-50/80 dark:bg-primary-950/80'
                : 'bg-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80',
            ]"
          >
            <div
              v-if="renamingSessionId === row.meta.sessionId"
              :class="['min-h-12 min-w-0 flex flex-1 items-center gap-1 px-2 py-1.5']"
            >
              <Input
                v-model="renameTitle"
                :aria-label="t('stage.chat.sessions.rename-input')"
                :placeholder="t('stage.chat.sessions.rename-placeholder')"
                autofocus
                @click.stop
                @keydown.enter.stop="commitRename(row)"
                @keydown.esc.stop="cancelRename"
              />
              <GhostButton
                size="unset"
                :aria-label="t('stage.chat.sessions.save-rename')"
                :title="t('stage.chat.sessions.save-rename')"
                :class="['size-8 shrink-0 rounded-md text-primary-500 hover:bg-primary-500/10', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
                @click.stop="commitRename(row)"
              >
                <span aria-hidden="true" :class="['i-solar:check-circle-outline size-4']" />
              </GhostButton>
              <GhostButton
                size="unset"
                :aria-label="t('stage.chat.sessions.cancel-rename')"
                :title="t('stage.chat.sessions.cancel-rename')"
                :class="['size-8 shrink-0 rounded-md text-neutral-400 hover:bg-neutral-500/10', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
                @click.stop="cancelRename"
              >
                <span aria-hidden="true" :class="['i-solar:close-circle-outline size-4']" />
              </GhostButton>
            </div>
            <BasicButton
              v-else
              size="unset"
              :aria-current="row.isActive ? 'true' : undefined"
              :class="[
                'session-select active:scale-100! min-h-12 min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left',
                'focus-visible:outline-2 focus-visible:outline-primary-500',
              ]"
              @click="selectSession(row.meta.sessionId)"
            >
              <span
                aria-hidden="true"
                :class="[
                  'h-5 w-0.5 shrink-0 rounded-full',
                  row.isActive ? 'bg-primary-500' : 'bg-transparent',
                ]"
              />
              <span :class="['min-w-0 flex-1']">
                <span :class="['block truncate text-sm font-medium']">{{ row.preview }}</span>
                <span :class="['mt-0.5 flex items-center gap-2 text-xs font-normal text-neutral-500 dark:text-neutral-400']">
                  <span>{{ row.activityAtLabel }}</span>
                  <span
                    v-if="row.meta.cloudChatId"
                    role="img"
                    :aria-label="t('stage.chat.sessions.cloud-badge')"
                    :title="t('stage.chat.sessions.cloud-badge')"
                    :class="['i-solar:cloud-check-outline size-4 shrink-0']"
                  />
                </span>
              </span>
            </BasicButton>
            <GhostButton
              v-if="renamingSessionId !== row.meta.sessionId"
              size="unset"
              :aria-label="t('settings.session-features.session-action', { title: row.preview })"
              :data-session-features="row.meta.sessionId"
              :title="t('settings.session-features.session-title')"
              :class="['size-8 shrink-0 rounded-md text-neutral-400 opacity-0 transition-opacity hover:text-primary-500 group-hover:opacity-100 focus-visible:opacity-100']"
              @click.stop="emit('configureSession', row.meta.sessionId)"
            >
              <span aria-hidden="true" :class="['i-solar:checklist-minimalistic-outline size-4']" />
            </GhostButton>
            <GhostButton
              v-if="renamingSessionId !== row.meta.sessionId"
              size="unset"
              :aria-label="`${t('stage.chat.sessions.rename')}: ${row.preview}`"
              :title="t('stage.chat.sessions.rename')"
              :class="['size-8 shrink-0 rounded-md text-neutral-400 opacity-0 transition-all hover:bg-primary-500/10 hover:text-primary-500 group-hover:opacity-100 focus-visible:opacity-100', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
              @click.stop="startRename(row)"
            >
              <span aria-hidden="true" :class="['i-solar:pen-2-linear size-4']" />
            </GhostButton>
            <GhostButton
              size="unset"
              :active="pendingDeleteSessionId === row.meta.sessionId"
              :aria-label="pendingDeleteSessionId === row.meta.sessionId
                ? `${t('stage.chat.sessions.confirm-delete-short')}: ${row.preview}`
                : `${t('stage.chat.sessions.delete')}: ${row.preview}`"
              :title="pendingDeleteSessionId === row.meta.sessionId
                ? t('stage.chat.sessions.confirm-delete-short')
                : t('stage.chat.sessions.delete')"
              :class="[
                'h-8 shrink-0 rounded-md text-red-500 transition-all',
                'hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400',
                'focus-visible:outline-2 focus-visible:outline-red-500',
                pendingDeleteSessionId === row.meta.sessionId
                  ? 'px-2 text-xs opacity-100'
                  : 'w-8 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              ]"
              @click="deleteDesktopSession(row.meta.sessionId)"
            >
              <span
                aria-hidden="true"
                :class="[
                  pendingDeleteSessionId === row.meta.sessionId
                    ? 'i-solar:trash-bin-minimalistic-bold size-3.5'
                    : 'i-solar:trash-bin-trash-outline size-4',
                ]"
              />
              <span v-if="pendingDeleteSessionId === row.meta.sessionId">
                {{ t('stage.chat.sessions.confirm-delete-short') }}
              </span>
            </GhostButton>
          </div>
          <SwipeActionsRoot
            v-else
            v-slot="{ open, toggle }"
            :open="expandedSessionId === row.meta.sessionId"
            @update:open="expandedSessionId = $event ? row.meta.sessionId : undefined"
            @interaction-start="expandedSessionId !== row.meta.sessionId && (expandedSessionId = undefined)"
            @action="emit('deleteSession', row.meta.sessionId)"
          >
            <SwipeActionsList :gap="16">
              <SwipeActionsItem v-slot="{ takeover }" value="delete" as-child>
                <SwipeActionButton
                  :label="t('stage.chat.sessions.delete-short')"
                  :aria-label="t('stage.chat.sessions.delete')"
                  icon="i-solar:trash-bin-trash-outline"
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
                  row.isActive ? 'bg-primary-50/80 dark:bg-primary-950/80' : props.compact ? 'bg-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80' : 'bg-white dark:bg-neutral-800',
                ]"
              >
                <div
                  v-if="renamingSessionId === row.meta.sessionId"
                  :class="[props.compact ? 'min-h-12 rounded-lg px-2 py-1.5' : 'min-h-20 rounded-2xl px-3 py-3', 'min-w-0 flex flex-1 items-center gap-1']"
                >
                  <Input
                    v-model="renameTitle"
                    :aria-label="t('stage.chat.sessions.rename-input')"
                    :placeholder="t('stage.chat.sessions.rename-placeholder')"
                    autofocus
                    @click.stop
                    @keydown.enter.stop="commitRename(row)"
                    @keydown.esc.stop="cancelRename"
                  />
                  <GhostButton
                    size="unset"
                    :aria-label="t('stage.chat.sessions.save-rename')"
                    :title="t('stage.chat.sessions.save-rename')"
                    :class="['size-9 shrink-0 rounded-lg text-primary-500 hover:bg-primary-500/10', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
                    @click.stop="commitRename(row)"
                  >
                    <span aria-hidden="true" :class="['i-solar:check-circle-outline size-5']" />
                  </GhostButton>
                  <GhostButton
                    size="unset"
                    :aria-label="t('stage.chat.sessions.cancel-rename')"
                    :title="t('stage.chat.sessions.cancel-rename')"
                    :class="['size-9 shrink-0 rounded-lg text-neutral-400 hover:bg-neutral-500/10', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
                    @click.stop="cancelRename"
                  >
                    <span aria-hidden="true" :class="['i-solar:close-circle-outline size-5']" />
                  </GhostButton>
                </div>
                <BasicButton
                  v-else
                  size="unset"
                  :aria-current="row.isActive ? 'true' : undefined"
                  :class="[
                    'session-select active:scale-100! min-w-0 flex-1 text-left',
                    props.compact ? 'min-h-12 rounded-lg px-2 py-1.5' : 'min-h-20 rounded-2xl px-3 py-3',
                    'focus-visible:outline-2 focus-visible:outline-primary-500',
                  ]"
                  @click="selectSession(row.meta.sessionId)"
                >
                  <span
                    v-if="props.compact"
                    aria-hidden="true"
                    :class="[
                      'h-5 w-0.5 shrink-0 rounded-full',
                      row.isActive ? 'bg-primary-500' : 'bg-transparent',
                    ]"
                  />
                  <span
                    v-else
                    aria-hidden="true"
                    :class="[
                      'size-5 shrink-0',
                      row.isActive ? 'i-solar:check-circle-bold text-primary-500' : 'i-solar:chat-line-outline text-neutral-400',
                    ]"
                  />
                  <span :class="['min-w-0 flex-1']">
                    <span :class="['block truncate text-sm font-medium']">{{ row.preview }}</span>
                    <span :class="['flex items-center gap-2 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
                      <span>{{ row.activityAtLabel }}</span>
                      <span v-if="row.isActive && !props.compact" :class="['text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
                      <span v-if="row.meta.cloudChatId" role="img" :aria-label="t('stage.chat.sessions.cloud-badge')" :title="t('stage.chat.sessions.cloud-badge')" :class="['i-solar:cloud-check-outline size-4 shrink-0']" />
                    </span>
                  </span>
                </BasicButton>
                <GhostButton
                  v-if="renamingSessionId !== row.meta.sessionId"
                  size="unset"
                  :aria-label="t('settings.session-features.session-action', { title: row.preview })"
                  :data-session-features="row.meta.sessionId"
                  :title="t('settings.session-features.session-title')"
                  :class="['size-11 shrink-0 rounded-xl text-neutral-400 hover:text-primary-500']"
                  @click.stop="emit('configureSession', row.meta.sessionId)"
                >
                  <span aria-hidden="true" :class="['i-solar:checklist-minimalistic-outline size-5']" />
                </GhostButton>
                <GhostButton
                  v-if="renamingSessionId !== row.meta.sessionId"
                  size="unset"
                  :class="[
                    'shrink-0 text-neutral-400 hover:bg-primary-500/10 hover:text-primary-500',
                    props.compact ? 'size-8 rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100' : 'size-11 rounded-xl',
                  ]"
                  :aria-label="`${t('stage.chat.sessions.rename')}: ${row.preview}`"
                  :title="t('stage.chat.sessions.rename')"
                  :style="props.compact ? undefined : { opacity: 'calc(1 - var(--swipe-progress, 0))' }"
                  @click.stop="startRename(row)"
                >
                  <span aria-hidden="true" :class="['i-solar:pen-2-linear', props.compact ? 'size-4' : 'size-5']" />
                </GhostButton>
                <GhostButton
                  size="unset"
                  :class="[
                    'shrink-0 text-neutral-400 hover:bg-red-500/10 hover:text-red-500',
                    props.compact ? 'size-8 rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100' : 'size-11 rounded-xl',
                  ]"
                  :aria-label="`${t('stage.chat.sessions.delete')}: ${row.preview}`"
                  :title="t('stage.chat.sessions.delete')"
                  :aria-expanded="open"
                  :tabindex="open ? -1 : 0"
                  :style="props.compact ? undefined : { opacity: 'calc(1 - var(--swipe-progress, 0))' }"
                  @click="toggle()"
                >
                  <span aria-hidden="true" :class="['i-solar:trash-bin-trash-outline', props.compact ? 'size-4' : 'size-5']" />
                </GhostButton>
              </div>
            </SwipeActionsContent>
          </SwipeActionsRoot>
        </li>
      </TransitionGroup>
    </ScrollableArea>
  </div>
</template>

<style scoped>
.session-select :deep(.basic-button-content) {
  width: 100%;
  min-width: 0;
  gap: 0.75rem;
}

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

.session-row-leave-active {
  transition: max-height 220ms ease, opacity 180ms ease, margin 220ms ease;
  max-height: 80px;
  pointer-events: none;
}
.session-row-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}
@media (prefers-reduced-motion: reduce) {
  .session-row-leave-active,
  .session-action-swap-enter-active,
  .session-action-swap-leave-active,
  .session-action-slot-enter-active,
  .session-action-slot-leave-active {
    transition: none;
  }
}
</style>
