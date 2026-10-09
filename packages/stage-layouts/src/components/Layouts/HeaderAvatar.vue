<script setup lang="ts">
import { signOut } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Avatar, DropdownMenu } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

defineProps<{
  /** Shows only the account control on the mobile Stage. @default false */
  compact?: boolean
}>()

const authStore = useAuthStore()
const { isAuthenticated, user, credits, planRemaining } = storeToRefs(authStore)
const { t } = useI18n()

const userName = computed(() => user.value?.name)
const userAvatar = computed(() => user.value?.image)

const formattedCredits = computed(() => credits.value.toLocaleString())
</script>

<template>
  <div flex items-center gap-2>
    <DropdownMenu
      align="end"
      :content-class="['w-60']"
      variant="blurry"
    >
      <template #trigger>
        <button
          type="button"
          :aria-label="userName || t('settings.pages.account.title')"
          :class="[
            'group h-10 flex items-center gap-2 rounded-full border-2 p-1 outline-none shadow-sm backdrop-blur-md',
            compact ? 'size-11 justify-center focus-visible:ring-2 focus-visible:ring-primary-500' : 'pl-1 pr-3',
            'border-neutral-100/60 bg-neutral-50/70 dark:border-neutral-800/30 dark:bg-neutral-800/70',
            'hover:bg-neutral-100 data-[state=open]:bg-neutral-100',
            'dark:hover:bg-neutral-800 dark:data-[state=open]:bg-neutral-800',
            'data-[state=open]:ring-2 data-[state=open]:ring-primary-500/20',
            'transition-colors duration-200 ease-in-out',
          ]"
          @click="authStore.updateCredits()"
        >
          <Avatar
            v-if="isAuthenticated"
            :src="userAvatar"
            :class="[
              'h-7 w-7 rounded-full',
              'bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
            ]"
          />
          <span
            v-else
            :class="[
              'size-7 flex items-center justify-center rounded-full',
              'bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300',
            ]"
          >
            <span :class="['i-solar:user-bold-duotone size-4']" aria-hidden="true" />
          </span>

          <span
            v-if="isAuthenticated && userName && !compact"
            :class="[
              'max-w-[100px] hidden truncate text-sm font-medium sm:block',
              'text-neutral-700 dark:text-neutral-200',
            ]"
          >
            {{ userName }}
          </span>
          <div
            v-if="!compact"
            :class="[
              'i-solar:alt-arrow-down-linear text-neutral-400',
              'transition-transform duration-200',
              'group-data-[state=open]:rotate-180',
            ]"
          />
        </button>
      </template>

      <template v-if="isAuthenticated">
        <div class="px-3 py-2">
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            Signed in as
          </p>
          <p class="truncate text-sm text-neutral-900 font-medium dark:text-white">
            {{ userName }}
          </p>
          <div
            v-if="planRemaining != null"
            class="mt-1 flex items-center gap-1.5 text-xs text-primary-600 font-medium dark:text-primary-400"
          >
            <div class="i-solar:star-bold-duotone text-sm" />
            <span>{{ planRemaining }}%</span>
          </div>
          <div class="mt-1 flex items-center gap-1.5 text-xs text-primary-600 font-medium dark:text-primary-400">
            <div class="i-solar:battery-charge-bold-duotone text-sm" />
            <span>{{ formattedCredits }} Flux</span>
          </div>
        </div>

        <DropdownMenuSeparator :class="['mx-2 my-1 h-px bg-neutral-200/80 dark:bg-neutral-700/80']" />

        <DropdownMenuItem as-child>
          <RouterLink
            to="/settings/account"
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
              'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
              'transition-colors duration-150 ease-in-out',
            ]"
          >
            <div class="i-solar:user-id-bold-duotone text-lg text-neutral-400 transition group-hover:text-primary-500" />
            Profile
          </RouterLink>
        </DropdownMenuItem>

        <DropdownMenuItem as-child>
          <RouterLink
            to="/settings/flux"
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
              'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
              'transition-colors duration-150 ease-in-out',
            ]"
          >
            <div class="i-solar:battery-charge-bold-duotone text-lg text-neutral-400 transition group-hover:text-primary-500" />
            Flux
          </RouterLink>
        </DropdownMenuItem>

        <DropdownMenuItem as-child>
          <RouterLink
            to="/settings/plan"
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
              'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
              'transition-colors duration-150 ease-in-out',
            ]"
          >
            <div class="i-solar:star-bold-duotone text-lg text-neutral-400 transition group-hover:text-primary-500" />
            {{ t('settings.pages.plan.title') }}
          </RouterLink>
        </DropdownMenuItem>

        <DropdownMenuItem as-child>
          <RouterLink
            to="/settings"
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
              'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
              'transition-colors duration-150 ease-in-out',
            ]"
          >
            <div class="i-solar:settings-minimalistic-bold-duotone text-lg text-neutral-400 transition group-hover:text-primary-500" />
            Settings
          </RouterLink>
        </DropdownMenuItem>

        <DropdownMenuSeparator :class="['mx-2 my-1 h-px bg-neutral-200/80 dark:bg-neutral-700/80']" />

        <DropdownMenuItem as-child>
          <button
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-red-600 dark:text-red-400',
              'data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-900/20',
              'transition-colors duration-150 ease-in-out',
            ]"
            @click="signOut"
          >
            <div class="i-solar:logout-3-bold-duotone text-lg transition group-hover:text-red-600 dark:group-hover:text-red-400" />
            Sign out
          </button>
        </DropdownMenuItem>
      </template>

      <template v-else>
        <DropdownMenuItem as-child>
          <button
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
              'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
              'transition-colors duration-150 ease-in-out',
            ]"
            @click="authStore.requestLogin()"
          >
            <span :class="['i-solar:login-3-bold-duotone text-lg text-neutral-400 transition group-hover:text-primary-500']" aria-hidden="true" />
            {{ t('stage.mobile-tools.sign-in') }}
          </button>
        </DropdownMenuItem>

        <DropdownMenuSeparator :class="['mx-2 my-1 h-px bg-neutral-200/80 dark:bg-neutral-700/80']" />

        <DropdownMenuItem as-child>
          <RouterLink
            to="/settings/flux"
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
              'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
              'transition-colors duration-150 ease-in-out',
            ]"
          >
            <span :class="['i-solar:battery-charge-bold-duotone text-lg text-neutral-400 transition group-hover:text-primary-500']" aria-hidden="true" />
            {{ t('settings.pages.flux.title') }}
          </RouterLink>
        </DropdownMenuItem>

        <DropdownMenuItem as-child>
          <RouterLink
            to="/settings"
            :class="[
              'group w-full flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2',
              'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
              'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
              'transition-colors duration-150 ease-in-out',
            ]"
          >
            <span :class="['i-solar:settings-minimalistic-bold-duotone text-lg text-neutral-400 transition group-hover:text-primary-500']" aria-hidden="true" />
            {{ t('settings.title') }}
          </RouterLink>
        </DropdownMenuItem>
      </template>
    </DropdownMenu>
  </div>
</template>
