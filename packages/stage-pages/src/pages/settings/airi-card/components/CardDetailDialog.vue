<script setup lang="ts">
import type { DocumentHistoryEntry } from '@proj-airi/stage-ui/libs/document-sync/client'

import { useBreakpoints } from '@proj-airi/stage-ui/composables/use-breakpoints'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { BottomDrawer } from '@proj-airi/ui'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from 'reka-ui'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import CardDetailContent from './CardDetailContent.vue'
import DeleteCardDialog from './DeleteCardDialog.vue'
import RestoreVersionDialog from './RestoreVersionDialog.vue'

interface Props {
  modelValue: boolean
  cardId: string
  initialTab?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t, locale } = useI18n()
const { isDesktop } = useBreakpoints()
const cardStore = useAiriCardStore()
const { removeCard } = cardStore

const contentRef = ref<InstanceType<typeof CardDetailContent>>()

const selectedCard = computed(() => {
  if (!props.cardId)
    return undefined
  return cardStore.getCard(props.cardId)
})

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// Delete confirmation
const showDeleteConfirm = ref(false)

async function handleDeleteConfirm() {
  if (selectedCard.value) {
    await removeCard(props.cardId)
    emit('update:modelValue', false)
  }
  showDeleteConfirm.value = false
}

// Card history restore confirmation
const restoringRevision = ref<number | null>(null)
const showRestoreConfirm = ref(false)
const pendingRestore = ref<DocumentHistoryEntry | null>(null)

// The restore dialog stacks at z-100, below the mobile drawer at z-[9999].
// On mobile the drawer closes first, the dialog opens once the drawer has
// closed, and the detail view reopens on the history tab after the dialog
// settles. This flag marks that handoff.
const restoreHandoff = ref(false)
// Initial tab for the reopen after the handoff, cleared once the content mounts.
const reopenTab = ref<string>()
const contentInitialTab = computed(() => reopenTab.value ?? props.initialTab)

// NOTICE:
// The handoff cannot wait for BottomDrawer's afterClose: vaul-vue emits
// animationEnd only for user-driven closes, not for a v-model close
// (vaul-vue/dist/index.js emitOpenChange). The delay matches the drawer close
// animation (O.DURATION = 0.5s in vaul-vue).
// Removal condition: vaul-vue emits animationEnd for programmatic closes.
const drawerCloseDurationMs = 550

function formatHistoryDate(at: string) {
  return new Date(at).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}

function handleRequestRestore(entry: DocumentHistoryEntry) {
  pendingRestore.value = entry
  if (isDesktop.value) {
    showRestoreConfirm.value = true
    return
  }
  restoreHandoff.value = true
  open.value = false
  setTimeout(() => {
    if (restoreHandoff.value)
      showRestoreConfirm.value = true
  }, drawerCloseDurationMs)
}

function handleDrawerCloseAutoFocus(event: Event) {
  // The restore dialog opens right after the drawer releases. Moving focus
  // back to a node inside the closed drawer would strand it in between.
  if (restoreHandoff.value)
    event.preventDefault()
}

async function settleRestoreHandoff() {
  if (!restoreHandoff.value)
    return
  restoreHandoff.value = false
  // The reopened drawer remounts the content, so the history tab reloads on its own.
  reopenTab.value = 'history'
  open.value = true
  await nextTick()
  reopenTab.value = undefined
}

function handleRestoreCancel() {
  void settleRestoreHandoff()
}

async function confirmRestoreVersion() {
  // The dialog closes on confirm, so the entry must live outside its visibility state.
  const entry = pendingRestore.value
  if (!entry || !selectedCard.value)
    return

  restoringRevision.value = entry.revision
  try {
    const restored = await cardStore.restoreCardVersion(props.cardId, entry.revision)
    toast(t(restored ? 'settings.pages.card.sync.history.restore_success' : 'settings.pages.card.sync.history.restore_failed', { name: selectedCard.value.name }))
    if (restored)
      await contentRef.value?.reloadHistory()
  }
  catch (error) {
    console.error('Error restoring card version:', error)
    toast(t('settings.pages.card.sync.history.restore_failed', { name: selectedCard.value.name }))
  }
  finally {
    restoringRevision.value = null
    pendingRestore.value = null
    await settleRestoreHandoff()
  }
}
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-100 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-100 m-0 max-h-[90vh] max-w-7xl w-[94vw] flex flex-col overflow-auto border border-neutral-200 rounded-xl bg-white p-5 shadow-xl 2xl:w-[70vw] lg:w-[85vw] md:w-[90vw] xl:w-[80vw] -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-800 sm:p-6">
        <CardDetailContent
          ref="contentRef"
          variant="dialog"
          :card-id="cardId"
          :initial-tab="contentInitialTab"
          :restoring-revision="restoringRevision"
          @close="emit('update:modelValue', false)"
          @request-restore="handleRequestRestore"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <BottomDrawer
    v-else
    v-model:open="open"
    :title="selectedCard?.name ?? t('settings.pages.card.title')"
    minimum-height="half"
    @close-auto-focus="handleDrawerCloseAutoFocus"
  >
    <CardDetailContent
      ref="contentRef"
      variant="drawer"
      :card-id="cardId"
      :initial-tab="contentInitialTab"
      :restoring-revision="restoringRevision"
      @close="open = false"
      @request-restore="handleRequestRestore"
    />
  </BottomDrawer>

  <!-- Delete confirmation dialog -->
  <DeleteCardDialog
    v-model="showDeleteConfirm"
    :card-name="selectedCard?.name"
    @confirm="handleDeleteConfirm"
    @cancel="showDeleteConfirm = false"
  />

  <!-- Restore version confirmation dialog -->
  <RestoreVersionDialog
    v-model="showRestoreConfirm"
    :card-name="selectedCard?.name"
    :version-date="pendingRestore ? formatHistoryDate(pendingRestore.at) : ''"
    @confirm="confirmRestoreVersion"
    @cancel="handleRestoreCancel"
  />
</template>
