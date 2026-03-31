<script setup lang="ts">
import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { signOut } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const { isAuthenticated, user, credits } = storeToRefs(authStore)

const userName = computed(() => user.value?.name ?? '')
const userEmail = computed(() => user.value?.email ?? null)
const userAvatar = computed(() => user.value?.image ?? null)

// Electron-aware environment check — reads the Vite env var directly to avoid
// importing @proj-airi/stage-shared which is only a devDependency.
function isElectron(): boolean {
  return import.meta.env.RUNTIME_ENVIRONMENT === 'electron'
}

// NOTICE: We re-declare the eventa event names here instead of importing from
// apps/stage-tamagotchi/src/shared/eventa.ts because stage-pages is a shared
// package that cannot depend on app-level modules. The event name strings must
// stay in sync with the canonical definitions in the tamagotchi shared module.
const electronAuthStartLogin = defineInvokeEventa<void>('eventa:invoke:electron:auth:start-login')
const electronAuthLogout = defineInvokeEventa<void>('eventa:invoke:electron:auth:logout')

/**
 * Resolve the Electron IPC renderer eventa context and return an invoke
 * function for the given eventa definition. Returns undefined when not
 * running in Electron or the ipcRenderer global is unavailable.
 */
function resolveElectronInvoke<Res, Req>(eventa: Parameters<typeof defineInvoke<Res, Req>>[1]) {
  const ipcRenderer = (globalThis as { window?: { electron?: { ipcRenderer?: unknown } } }).window?.electron?.ipcRenderer
  if (!ipcRenderer)
    return undefined

  // NOTICE: Dynamically import the adapter to avoid a hard dependency on
  // @moeru/eventa/adapters/electron/renderer at the module level.
  // createContext is synchronous and cached internally by electron-vueuse.
  try {
    // eslint-disable-next-line ts/no-require-imports
    const { createContext } = require('@moeru/eventa/adapters/electron/renderer') as typeof import('@moeru/eventa/adapters/electron/renderer')
    const { context } = createContext(ipcRenderer as Parameters<typeof createContext>[0])
    return defineInvoke(context, eventa)
  }
  catch {
    return undefined
  }
}

function handleLogin() {
  if (isElectron()) {
    const invoke = resolveElectronInvoke(electronAuthStartLogin)
    invoke?.()
  }
  else {
    authStore.needsLogin = true
  }
}

async function handleLogout() {
  await signOut()

  if (isElectron()) {
    const invoke = resolveElectronInvoke(electronAuthLogout)
    invoke?.()
  }

  router.push('/settings')
}
</script>

<template>
  <div :class="['flex flex-col gap-6', 'p-4']">
    <!-- Authenticated state -->
    <template v-if="isAuthenticated">
      <!-- Profile card -->
      <div :class="['flex flex-col items-center gap-3', 'rounded-xl p-6', 'bg-neutral-50 dark:bg-neutral-900']">
        <!-- Avatar -->
        <div :class="['size-20 rounded-full overflow-hidden', 'bg-neutral-200 dark:bg-neutral-700', 'flex items-center justify-center']">
          <img
            v-if="userAvatar"
            :src="userAvatar"
            :alt="userName"
            :class="['size-full object-cover']"
          >
          <div
            v-else
            :class="['i-solar:user-circle-bold-duotone', 'size-12 text-neutral-400']"
          />
        </div>

        <!-- Name & email -->
        <div :class="['flex flex-col items-center gap-1']">
          <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.account.signedInAs') }}
          </span>
          <h2 :class="['text-lg font-semibold']">
            {{ userName }}
          </h2>
          <p
            v-if="userEmail"
            :class="['text-sm text-neutral-500 dark:text-neutral-400']"
          >
            {{ userEmail }}
          </p>
        </div>
      </div>

      <!-- Flux balance summary -->
      <RouterLink
        to="/settings/flux"
        :class="[
          'flex items-center justify-between',
          'rounded-xl p-4',
          'border border-neutral-200 dark:border-neutral-800',
          'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
          'transition-colors',
          'no-underline text-inherit',
        ]"
      >
        <div :class="['flex items-center gap-3']">
          <div :class="['i-solar:battery-charge-bold-duotone', 'size-6 text-primary-500']" />
          <div :class="['flex flex-col']">
            <span :class="['text-sm font-medium']">
              {{ t('settings.pages.account.fluxBalance') }}
            </span>
            <span :class="['text-2xl font-bold']">
              {{ credits }}
            </span>
          </div>
        </div>
        <div :class="['flex items-center gap-1', 'text-sm text-neutral-500 dark:text-neutral-400']">
          <span>{{ t('settings.pages.account.viewFluxDetails') }}</span>
          <div :class="['i-solar:alt-arrow-right-linear', 'size-4']" />
        </div>
      </RouterLink>

      <!-- Logout button -->
      <button
        :class="[
          'mt-4 w-full rounded-lg py-2.5 px-4',
          'text-sm font-medium',
          'text-red-600 dark:text-red-400',
          'bg-red-500/10 hover:bg-red-500/20',
          'border border-red-200 dark:border-red-800/50',
          'transition-colors cursor-pointer',
        ]"
        @click="handleLogout"
      >
        {{ t('settings.pages.account.logout') }}
      </button>
    </template>

    <!-- Unauthenticated state -->
    <template v-else>
      <div :class="['flex flex-col items-center gap-6', 'rounded-xl p-8', 'bg-neutral-50 dark:bg-neutral-900']">
        <div :class="['i-solar:user-circle-bold-duotone', 'size-16 text-neutral-300 dark:text-neutral-600']" />
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400', 'text-center max-w-xs']">
          {{ t('settings.pages.account.notLoggedIn') }}
        </p>
        <button
          :class="[
            'rounded-lg py-2.5 px-6',
            'text-sm font-medium',
            'text-white',
            'bg-primary-500 hover:bg-primary-600',
            'transition-colors cursor-pointer',
          ]"
          @click="handleLogin"
        >
          {{ t('settings.pages.account.login') }}
        </button>
      </div>
    </template>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.account.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.account.description
  icon: i-solar:user-circle-bold-duotone
  settingsEntry: false
  order: 0
  stageTransition:
    name: slide
</route>
