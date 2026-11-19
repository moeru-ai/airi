<script setup lang="ts">
import type { ControlsMenuAction } from '../../../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { InboxPanel } from '@proj-airi/stage-ui/components'
import { useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useFluxStatus } from '@proj-airi/stage-ui/composables/use-flux-status'
import { AIRI_FLUX_URL } from '@proj-airi/stage-ui/constants/public-links'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useInboxStore } from '@proj-airi/stage-ui/stores/inbox'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Avatar, Badge, DropdownMenu, MenuItem, menuItemClasses, MenuRadioItem, MenuSeparator, MenuSwitchItem } from '@proj-airi/ui'
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from 'reka-ui'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronAppQuit,
  electronOpenSettings,
  noticeWindowEventa,
} from '../../../../shared/eventa'
import { createPlaybackSpeakingReader } from '../../../composables/playback-speaking-reader'
import { useControlsIslandStore } from '../../../stores/controls-island'

const props = defineProps<{
  /** The menu opens beside the Island, away from the screen corner that the Island docks to. */
  side: 'left' | 'right'
  align: 'start' | 'end'
  /** The main window started a sign-in that has not ended. */
  signingIn: boolean
}>()

const emit = defineEmits<{
  /** The user chose an item that the main window carries out after the menu closes. */
  action: [action: ControlsMenuAction]
  /** The menu content left the page, after its exit animation. */
  closed: []
  /** A read of Notifications reached the server or rolled back. */
  notificationsRead: []
}>()

/** The open state. The menu window opens it on each request of the main window. */
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { trackControlsIslandAction } = useAnalytics()
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const quitApp = useElectronEventaInvoke(electronAppQuit)
const requestNotice = useElectronEventaInvoke(noticeWindowEventa.openWindow)

// Account: one row at the top, as an app menu shows who is signed in. The main window owns sign-in.
const { isAuthenticated, user } = storeToRefs(useAuthStore())
// The Flux line follows the shared rule: the Capacitor percent for a subscriber, otherwise the Flux balance.
const { subscribed, low, valueLabel: fluxValue, icon: fluxIcon } = useFluxStatus()

const inbox = useInboxStore()
const { unread, messages, loading, error, hasMore, signedIn: inboxSignedIn } = storeToRefs(inbox)
const now = useNow({ interval: 60_000 })
const notificationsOpen = ref(false)
watch(notificationsOpen, (opened) => {
  if (opened) {
    trackControlsIslandAction({ action: 'open_notifications' })
    void inbox.loadFirstPage()
  }
})

// Each read resolves after it reached the server or rolled back. The dot on the more button reads its own count, so it
// reads again only then.
async function markRead(id: string) {
  await inbox.markRead(id)
  emit('notificationsRead')
}
async function markAllRead() {
  await inbox.markAllRead()
  emit('notificationsRead')
}

// Character
const cardStore = useAiriCardStore()
const { cards, activeCardId } = storeToRefs(cardStore)
const cardList = computed(() => Array.from(cards.value.entries()).map(([id, card]) => ({ id, name: card.name })))
const activeCardName = computed(() => cards.value.get(activeCardId.value)?.name)
// `activateCard` also saves the choice, selects the default avatar of the character, and applies its module settings.
async function switchCharacter(id: string) {
  if (id === activeCardId.value)
    return
  try {
    if (await cardStore.activateCard(id))
      trackControlsIslandAction({ action: 'switch_profile' })
  }
  catch (error) {
    console.error('Failed to switch the character:', error)
  }
}
const selectedCardId = computed({
  get: () => activeCardId.value,
  set: (id: string) => {
    void switchCharacter(id)
  },
})

// Muting also publishes a stop request, so it clears the queued and the playing speech on its way.
// The main window plays the speech, so this window asks it whether the character speaks.
const { speechMuted, toggleSpeechMuted } = useStopSpeakingButton({
  resolveSpeakingState: createPlaybackSpeakingReader(),
})
const characterVoice = computed({
  get: () => !speechMuted.value,
  set: (on: boolean) => {
    if (on === speechMuted.value)
      toggleSpeechMuted()
  },
})

// Window
const { alwaysOnTop } = storeToRefs(useSettings())
const keepOnTop = computed({
  get: () => alwaysOnTop.value,
  set: (on: boolean) => {
    alwaysOnTop.value = on
    trackControlsIslandAction({ action: on ? 'pin_on_top' : 'unpin_from_top' })
  },
})

const controlsIslandStore = useControlsIslandStore()
const fadeOnHover = computed({
  get: () => controlsIslandStore.fadeOnHoverEnabled,
  set: on => void setFadeOnHover(on),
})

/** The first time, a notice window explains the fade and asks the user to confirm. */
async function setFadeOnHover(on: boolean) {
  if (on && !controlsIslandStore.dontShowItAgainNoticeFadeOnHover) {
    try {
      const acknowledged = await requestNotice({ id: 'fade-on-hover', route: '/notice/fade-on-hover', type: 'fade-on-hover' })
      if (!acknowledged)
        return
    }
    catch (error) {
      console.error('Failed to open fade-on-hover notice:', error)
      return
    }
  }

  if (on)
    controlsIslandStore.enableFadeOnHover()
  else
    controlsIslandStore.disableFadeOnHover()
  trackControlsIslandAction({ action: on ? 'enable_fade_on_hover' : 'disable_fade_on_hover' })
}

function openSettingsAt(route: string, action: 'toggle_settings' | 'open_account' | 'open_subscription' | 'manage_profiles') {
  trackControlsIslandAction({ action })
  openSettings({ route })
}

function centerWindow() {
  trackControlsIslandAction({ action: 'center_main_window' })
  emit('action', 'center-main-window')
}

function quit() {
  trackControlsIslandAction({ action: 'close_app' })
  quitApp()
}

// The menu window mounts the menu with its first request, so the menu can mount already open.
watch(open, (opened) => {
  if (opened)
    trackControlsIslandAction({ action: 'open_menu' })
  else
    notificationsOpen.value = false
}, { immediate: true })

const subMenuClasses = [
  'z-[10001] min-w-48 rounded-xl border p-1 shadow-lg outline-none backdrop-blur-md',
  'border-neutral-100/80 bg-neutral-100/90 text-neutral-700 dark:border-neutral-800/60 dark:bg-neutral-800/90 dark:text-neutral-100',
  'max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto',
]

// The open menus float in a transparent window, and the desktop shows through it.
// The menu content roots are not exposed. An element in each slot mounts with its menu and finds the root that paints the fill.
const menuSurfaceAnchor = useTemplateRef<HTMLElement>('menuSurfaceAnchor')
useBackdropSurface(() => menuSurfaceAnchor.value?.closest<HTMLElement>('[role="menu"]'))
// The anchor unmounts with the menu content, which stays until its exit animation ends.
watch(menuSurfaceAnchor, (element, previous) => {
  if (!element && previous)
    emit('closed')
}, { flush: 'post' })
const notificationsSurfaceAnchor = useTemplateRef<HTMLElement>('notificationsSurfaceAnchor')
useBackdropSurface(() => notificationsSurfaceAnchor.value?.closest<HTMLElement>('[role="menu"]'))
const characterSurfaceAnchor = useTemplateRef<HTMLElement>('characterSurfaceAnchor')
useBackdropSurface(() => characterSurfaceAnchor.value?.closest<HTMLElement>('[role="menu"]'))
</script>

<template>
  <DropdownMenu
    v-model:open="open"
    :side="props.side"
    :align="props.align"
    :side-offset="8"
    variant="blurry"
    :modal="false"
    :content-class="['w-64 max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto']"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>

    <span ref="menuSurfaceAnchor" aria-hidden="true" :class="['hidden']" />

    <!-- Account -->
    <MenuItem
      v-if="isAuthenticated"
      data-testid="controls-island-account"
      :class="['py-2!']"
      @select="openSettingsAt('/settings/account', 'open_account')"
    >
      <Avatar
        :src="user?.image"
        :seed="user?.id"
        :class="['size-8 shrink-0 overflow-hidden rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-200']"
      />
      <span :class="['min-w-0 flex flex-1 flex-col gap-1']">
        <span :class="['truncate font-semibold']">{{ user?.name }}</span>
        <span
          data-testid="controls-island-flux"
          :class="[
            'flex items-center gap-1 text-xs tabular-nums',
            subscribed && low ? 'text-orange-600 dark:text-orange-300' : 'text-neutral-500 dark:text-neutral-400',
          ]"
        >
          <span aria-hidden="true" :class="[fluxIcon, 'size-3.5 shrink-0']" />
          {{ subscribed ? fluxValue : `${fluxValue} Flux` }}
        </span>
      </span>
    </MenuItem>
    <!-- The way to the Subscription page. The account row above already shows the Flux value. -->
    <MenuItem
      v-if="isAuthenticated"
      data-testid="controls-island-subscription"
      @select="openSettingsAt(AIRI_FLUX_URL, 'open_subscription')"
    >
      {{ t('settings.pages.flux.title') }}
    </MenuItem>
    <MenuItem v-else data-testid="controls-island-sign-in" :disabled="props.signingIn" @select="emit('action', 'sign-in')">
      <span v-if="props.signingIn" aria-hidden="true" :class="['i-svg-spinners:ring-resize size-4 shrink-0 text-primary-500']" />
      {{ props.signingIn ? t('tamagotchi.stage.controls-island.logging-in') : t('tamagotchi.stage.controls-island.sign-in') }}
    </MenuItem>

    <DropdownMenuSub v-if="inboxSignedIn" v-model:open="notificationsOpen">
      <DropdownMenuSubTrigger data-testid="controls-island-notifications" :class="menuItemClasses">
        <span :class="['flex-1']">{{ t('stage.notifications.title') }}</span>
        <Badge :count="unread" data-testid="controls-island-notifications-count" />
        <span aria-hidden="true" :class="['i-mingcute:right-line size-4 shrink-0 opacity-60']" />
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent :side-offset="6" :collision-padding="8" :class="[subMenuClasses, 'w-80']">
          <span ref="notificationsSurfaceAnchor" aria-hidden="true" :class="['hidden']" />
          <InboxPanel
            data-testid="controls-island-notifications-view"
            :messages="messages" :now="now" :unread="unread"
            :loading="loading" :error="error" :has-more="hasMore"
            surface="drawer"
            @open="markRead" @read-all="markAllRead" @retry="inbox.loadFirstPage" @load-more="inbox.loadMore"
          />
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
    <MenuSeparator />

    <!-- Character -->
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="controls-island-character" :class="menuItemClasses">
        <span :class="['flex-1']">{{ t('tamagotchi.stage.controls-island.character') }}</span>
        <span :class="['max-w-24 truncate text-xs opacity-60']">{{ activeCardName }}</span>
        <span aria-hidden="true" :class="['i-mingcute:right-line size-4 shrink-0 opacity-60']" />
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent :side-offset="6" :collision-padding="8" :class="subMenuClasses">
          <span ref="characterSurfaceAnchor" aria-hidden="true" :class="['hidden']" />
          <DropdownMenuRadioGroup v-model="selectedCardId">
            <MenuRadioItem v-for="card in cardList" :key="card.id" :value="card.id">
              <span :class="['truncate']">{{ card.name }}</span>
            </MenuRadioItem>
          </DropdownMenuRadioGroup>
          <MenuSeparator />
          <MenuItem @select="openSettingsAt('/settings/airi-card', 'manage_profiles')">
            {{ t('tamagotchi.stage.controls-island.manage-characters') }}
          </MenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
    <MenuSwitchItem v-model="characterVoice" data-testid="controls-island-character-voice">
      {{ t('tamagotchi.stage.controls-island.character-voice') }}
    </MenuSwitchItem>
    <MenuItem data-testid="controls-island-hearing-controls" @select="emit('action', 'open-hearing')">
      {{ t('tamagotchi.stage.controls-island.microphone-settings') }}
    </MenuItem>
    <MenuSeparator />

    <!-- Window -->
    <MenuSwitchItem v-model="keepOnTop" data-testid="controls-island-keep-on-top">
      {{ t('tamagotchi.stage.controls-island.keep-on-top') }}
    </MenuSwitchItem>
    <MenuSwitchItem v-model="fadeOnHover" data-testid="controls-island-fade-on-hover">
      {{ t('tamagotchi.stage.controls-island.fade-on-hover.title') }}
    </MenuSwitchItem>
    <MenuItem @select="centerWindow">
      {{ t('tamagotchi.stage.controls-island.center-main-window') }}
    </MenuItem>
    <MenuSeparator />

    <!-- App -->
    <MenuItem data-testid="controls-island-settings" @select="openSettingsAt('/settings', 'toggle_settings')">
      {{ t('tamagotchi.stage.controls-island.settings') }}
    </MenuItem>
    <MenuItem data-testid="controls-island-quit" @select="quit">
      {{ t('tamagotchi.stage.controls-island.quit') }}
    </MenuItem>
  </DropdownMenu>
</template>
