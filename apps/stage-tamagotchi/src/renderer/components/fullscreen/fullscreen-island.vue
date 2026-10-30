<script setup lang="ts">
import type { FullscreenSurfaceId } from '../../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { InboxPopover } from '@proj-airi/stage-ui/components'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useInboxStore } from '@proj-airi/stage-ui/stores/inbox'
import { Avatar, Badge, useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { PopoverTrigger, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronAuthStartLogin } from '../../../shared/eventa'
import { useFullscreenStore } from '../../stores/fullscreen'
import { fullscreenSurfaces } from './surfaces'

// The island of the fullscreen mode: a button for each registered surface and the theme switch. The account with its
// notifications sits in an island above it, and the way out of the mode in an island below it.
const { t } = useI18n()
const fullscreen = useFullscreenStore()
const { surface } = storeToRefs(fullscreen)

const KEY = 'tamagotchi.stage.fullscreen-island'

const surfaces = Object.entries(fullscreenSurfaces).map(([id, definition]) => ({ id: id as FullscreenSurfaceId, ...definition }))

function show(id: FullscreenSurfaceId, page?: string) {
  void fullscreen.open(id, page).catch(error => console.error('[Fullscreen island] Failed to show the surface:', error))
}

// The avatar opens the account page of the settings. Signed out, the same place starts the sign-in.
const { isAuthenticated, user, credits } = storeToRefs(useAuthStore())
const startSigningIn = useElectronEventaInvoke(electronAuthStartLogin)

// The notifications open as a small card beside the bell, as from the account menu of the web app.
const { unread, signedIn: inboxSignedIn } = storeToRefs(useInboxStore())
const notificationsOpen = shallowRef(false)
const notificationsLabel = computed(() => unread.value > 0
  ? t(`${KEY}.notifications-unread`, { count: unread.value })
  : t(`${KEY}.notifications`))

// The theme cycles light, dark, then the system theme, like the Controls Island. Each button names the next theme.
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

const focusRingClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300'

/** The classes of an island button. A hover shows the round background and keeps the icon color. */
function buttonClass(pressed = false) {
  return [
    'relative size-9 flex shrink-0 items-center justify-center rounded-full outline-none',
    focusRingClass,
    'transition-colors transition-transform active:scale-95',
    'hover:bg-neutral-200 dark:hover:bg-neutral-800',
    pressed ? 'text-primary-500 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-500',
  ]
}

/** The avatar fills its button. A hover rings it in the theme color, as a border marks only a hover. */
const avatarButtonClass = [
  'size-9 shrink-0 rounded-full outline-none',
  focusRingClass,
  'transition-shadow transition-transform active:scale-95',
  'hover:ring-2 hover:ring-primary-300 dark:hover:ring-primary-700',
]

const separatorClass = ['my-0.5 h-px w-4 shrink-0', 'bg-neutral-200 dark:bg-neutral-700']

const pillClass = ['rounded-full p-0.5', 'bg-white shadow-md dark:bg-neutral-900']
</script>

<template>
  <div :class="['flex flex-col items-center gap-2']">
    <div :class="['flex flex-col items-center gap-1', pillClass]">
      <template v-if="isAuthenticated">
        <!-- The name and the Flux balance show beside the avatar, as on the account card of the Controls Island. -->
        <TooltipProvider :delay-duration="0">
          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                :class="avatarButtonClass"
                :aria-label="t(`${KEY}.account`)"
                @click="show('settings', '/settings/account')"
              >
                <Avatar
                  :src="user?.image"
                  :class="[
                    'size-full flex items-center justify-center overflow-hidden rounded-full',
                    'bg-primary-100 dark:bg-primary-900/40',
                  ]"
                />
              </button>
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
        <!-- The bell renders inside the root of the card, so it is the trigger of the card and a second click closes it. -->
        <InboxPopover v-if="inboxSignedIn" v-model:open="notificationsOpen" side="right" align="start">
          <PopoverTrigger as-child>
            <button
              type="button"
              :class="buttonClass(notificationsOpen)"
              :aria-label="notificationsLabel"
              :title="notificationsLabel"
            >
              <span :class="['i-solar:bell-bold-duotone', 'size-5']" />
              <Badge
                v-if="unread > 0"
                dot
                :class="['pointer-events-none absolute right-1.5 top-1.5 ring-2 ring-white dark:ring-neutral-900']"
              />
            </button>
          </PopoverTrigger>
        </InboxPopover>
      </template>
      <button
        v-else
        type="button"
        :class="buttonClass()"
        :aria-label="t(`${KEY}.sign-in`)"
        :title="t(`${KEY}.sign-in`)"
        @click="startSigningIn()"
      >
        <span :class="['i-solar:user-rounded-bold-duotone', 'size-5']" />
      </button>
    </div>
    <div :class="['flex flex-col items-center gap-1', pillClass]">
      <button
        v-for="entry in surfaces"
        :key="entry.id"
        type="button"
        :class="buttonClass(surface === entry.id)"
        :aria-pressed="surface === entry.id"
        :aria-label="t(entry.label)"
        :title="t(entry.label)"
        @click="show(entry.id)"
      >
        <span :class="[entry.icon, 'size-5']" />
      </button>
      <div :class="separatorClass" />
      <button
        type="button"
        :class="buttonClass()"
        :aria-label="themeLabel"
        :title="themeLabel"
        @click="switchToNextTheme"
      >
        <span :class="[themeIcon, 'size-5']" />
      </button>
    </div>
    <div :class="pillClass">
      <button
        type="button"
        :class="buttonClass()"
        :aria-label="t(`${KEY}.exit`)"
        :title="t(`${KEY}.exit`)"
        @click="fullscreen.close()"
      >
        <span :class="['i-solar:quit-full-screen-square-bold', 'size-5']" />
      </button>
    </div>
  </div>
</template>
