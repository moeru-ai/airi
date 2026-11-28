<script setup lang="ts">
import type { FullscreenSurfaceId } from '../../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { InboxPopover } from '@proj-airi/stage-ui/components'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useInboxStore } from '@proj-airi/stage-ui/stores/inbox'
import { Avatar, Badge, Dock, DockButton, DockSeparator, useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { PopoverTrigger, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronAuthStartLogin } from '../../../shared/eventa'
import { useFullscreenStore } from '../../stores/fullscreen'
import { fullscreenSurfaces } from './surfaces'

// Account and notification controls sit above the fullscreen surface dock. The exit control has a separate dock.
const { t } = useI18n()
const fullscreen = useFullscreenStore()
const { surface } = storeToRefs(fullscreen)

const KEY = 'tamagotchi.stage.fullscreen-island'

const surfaces = Object.entries(fullscreenSurfaces).map(([id, definition]) => ({ id: id as FullscreenSurfaceId, ...definition }))

function show(id: FullscreenSurfaceId, page?: string) {
  void fullscreen.open(id, page).catch(error => console.error('[Fullscreen island] Failed to show the surface:', error))
}

// The avatar opens account settings. The signed-out control starts sign-in.
const { isAuthenticated, user, credits } = storeToRefs(useAuthStore())
const startSigningIn = useElectronEventaInvoke(electronAuthStartLogin)

// Notifications open beside the bell, as in the web account menu.
const { unread, signedIn: inboxSignedIn } = storeToRefs(useInboxStore())
const notificationsOpen = shallowRef(false)
const notificationsLabel = computed(() => unread.value > 0
  ? t(`${KEY}.notifications-unread`, { count: unread.value })
  : t(`${KEY}.notifications`))

// The theme cycles through light, dark, and system, as in the Controls Island. Each button names the next theme.
const { themeMode, switchToNextTheme } = useTheme()
const themeIcon = computed(() => ({
  light: 'i-solar:sun-2-bold-duotone',
  dark: 'i-solar:moon-bold-duotone',
  auto: 'i-lucide:contrast',
})[themeMode.value])
const themeLabel = computed(() => t({
  light: `${KEY}.switch-to-dark-mode`,
  dark: `${KEY}.switch-to-system-mode`,
  auto: `${KEY}.switch-to-light-mode`,
}[themeMode.value]))
</script>

<template>
  <div :class="['flex flex-col items-center gap-2']">
    <Dock orientation="vertical" size="md" variant="blurry" tooltip-side="right">
      <template v-if="isAuthenticated">
        <!-- The name and Flux balance appear beside the avatar, as on the Controls Island account card. -->
        <TooltipProvider :delay-duration="0">
          <TooltipRoot>
            <TooltipTrigger as-child>
              <DockButton
                :label="t(`${KEY}.account`)"
                :tooltip="false"
                @click="show('settings', '/settings/account')"
              >
                <Avatar
                  :src="user?.image"
                  :class="[
                    'size-9 shrink-0 overflow-hidden rounded-full',
                    'bg-primary-100 dark:bg-primary-900/40',
                  ]"
                />
              </DockButton>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="8"
                :class="[
                  'z-50 flex flex-col gap-1 rounded-2xl px-3 py-2',
                  'bg-white shadow-md dark:bg-neutral-900',
                ]"
              >
                <span :class="['max-w-48 truncate text-sm font-semibold', 'text-neutral-800 dark:text-neutral-200']">
                  {{ user?.name }}
                </span>
                <span
                  :class="[
                    'w-fit flex items-center gap-1 rounded-md px-1.5 py-0.5',
                    'bg-primary-500/12 dark:bg-primary-400/12',
                    'text-[10px] font-semibold tabular-nums',
                    'text-primary-600 dark:text-primary-400',
                  ]"
                >
                  <span :class="['i-solar:battery-charge-bold-duotone', 'size-3 shrink-0']" />
                  <span :class="['whitespace-nowrap leading-tight']">{{ credits }} Flux</span>
                </span>
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </TooltipProvider>
        <!-- The bell owns the popover trigger. A second click closes the card. -->
        <InboxPopover v-if="inboxSignedIn" v-model:open="notificationsOpen" side="right" align="start">
          <PopoverTrigger as-child>
            <DockButton
              icon="i-solar:bell-bold-duotone"
              :label="notificationsLabel"
              :pressed="notificationsOpen"
              :tooltip="!notificationsOpen"
              :class="['relative']"
            >
              <span :class="['i-solar:bell-bold-duotone size-5']" />
              <Badge
                v-if="unread > 0"
                dot
                :class="['pointer-events-none absolute right-1.5 top-1.5 ring-2 ring-white dark:ring-neutral-900']"
              />
            </DockButton>
          </PopoverTrigger>
        </InboxPopover>
      </template>
      <DockButton
        v-else
        icon="i-solar:user-rounded-bold-duotone"
        :label="t(`${KEY}.sign-in`)"
        @click="startSigningIn()"
      />
    </Dock>
    <Dock orientation="vertical" size="md" variant="blurry">
      <DockButton
        v-for="entry in surfaces"
        :key="entry.id"
        :icon="entry.icon"
        :label="t(entry.label)"
        :pressed="surface === entry.id"
        @click="show(entry.id)"
      />
      <DockSeparator />
      <DockButton :icon="themeIcon" :label="themeLabel" @click="switchToNextTheme" />
    </Dock>
    <Dock orientation="vertical" size="md" variant="blurry">
      <DockButton icon="i-mingcute:fullscreen-exit-line" :label="t(`${KEY}.exit`)" @click="fullscreen.close()" />
    </Dock>
  </div>
</template>
