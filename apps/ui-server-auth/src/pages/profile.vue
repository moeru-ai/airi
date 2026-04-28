<script setup lang="ts">
import type { ProfileUser } from '../modules/profile'

import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
import { useLinkedAccounts } from '@proj-airi/stage-ui/composables'
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { Button, FieldInput } from '@proj-airi/ui'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { getAuthClient } from '../modules/auth-client'
import { requestPasswordReset } from '../modules/email-password'
import {
  changePassword,
  describeProfileError,
  getCurrentSession,
  signOut,
  updateUserProfile,
} from '../modules/profile'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'

const { t, locale } = useI18n()
const router = useRouter()

const bootstrapContext = getServerAuthBootstrapContext()
const apiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL

const initialLoading = shallowRef(true)
const user = shallowRef<ProfileUser | null>(null)

const profileForm = reactive({ name: '' })
const profileLoading = shallowRef(false)
const profileError = shallowRef<string | null>(null)
const profileSuccess = shallowRef<string | null>(null)

const passwordForm = reactive({
  current: '',
  next: '',
  confirm: '',
})
const passwordLoading = shallowRef(false)
const passwordError = shallowRef<string | null>(null)
const passwordSuccess = shallowRef<string | null>(null)

// "Set password" path for users without an existing credential account
// (signed up via social provider). We send them through the standard
// forgot-password email flow rather than exposing a direct setPassword
// endpoint — re-using the link-based flow keeps server surface small and
// gives us a fresh email-ownership proof at the moment of password set.
const setPasswordLoading = shallowRef(false)
const setPasswordError = shallowRef<string | null>(null)
const setPasswordSuccess = shallowRef<string | null>(null)

const signOutLoading = shallowRef(false)
const signOutError = shallowRef<string | null>(null)

// Avatar comes pre-decorated by the server: `image` is either the manually
// set / provider URL or a Gravatar fallback URL. We detect the fallback by
// URL prefix so the server doesn't need to ship a redundant `imageSource`
// flag — gravatar URLs are stable enough that prefix-matching is fine.
// See apps/server/src/routes/oidc/token-auth.ts for the server-side build.
const GRAVATAR_AVATAR_PREFIX = 'https://www.gravatar.com/avatar/'
const avatarUrl = computed(() => user.value?.image ?? null)
const usingGravatarFallback = computed(
  () => avatarUrl.value?.startsWith(GRAVATAR_AVATAR_PREFIX) ?? false,
)
const gravatarProfileUrl = computed(() => {
  if (!usingGravatarFallback.value || !user.value?.email)
    return null
  return `https://gravatar.com/${encodeURIComponent(user.value.email.trim().toLowerCase())}`
})

// Connected accounts: state + handlers come from the shared composable
// in stage-ui (mirrored on stage-web). Destructuring at top-level so the
// refs auto-unwrap inside the template — Vue's auto-unwrap only fires on
// top-level setup bindings, not on `obj.someRef` access.
const isAuthenticated = computed(() => user.value !== null)
const {
  loading: linkedAccountsLoading,
  error: linkedAccountsError,
  message: linkedAccountsMessage,
  inFlight: linkActionInFlight,
  accountsByProvider: linkedAccountsByProvider,
  hasCredentialAccount,
  unlink: unlinkLinkedProvider,
  link: linkLinkedProvider,
} = useLinkedAccounts({
  client: getAuthClient({ apiServerUrl }),
  isAuthenticated,
  describeError: describeProfileError,
  messages: {
    listFailed: t('server.auth.profile.linkedAccounts.error.listFailed'),
    unlinkFailed: t('server.auth.profile.linkedAccounts.error.unlinkFailed'),
    linkFailed: t('server.auth.profile.linkedAccounts.error.linkFailed'),
    lastAccount: t('server.auth.profile.linkedAccounts.error.lastAccount'),
    unlinked: provider => t('server.auth.profile.linkedAccounts.message.unlinked', { provider }),
    linkStarted: provider => t('server.auth.profile.linkedAccounts.message.linkStarted', { provider }),
  },
})

const nameDirty = computed(() => {
  if (!user.value)
    return false
  return profileForm.name.trim().length > 0 && profileForm.name.trim() !== user.value.name
})

// Render createdAt with the active i18n locale so dates feel native (e.g. zh
// users see `2025年4月1日` while en users see `April 1, 2025`). Falls back to
// the raw ISO string if Intl rejects the locale.
const formattedCreatedAt = computed(() => {
  if (!user.value?.createdAt)
    return ''
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' })
      .format(new Date(user.value.createdAt))
  }
  catch {
    return user.value.createdAt
  }
})

onMounted(async () => {
  try {
    const result = await getCurrentSession({ apiServerUrl })
    if (!result.user) {
      // Preserve the original target so the user lands back on /profile after
      // sign-in, rather than the sign-in default landing.
      await router.replace({
        path: '/sign-in',
        query: { redirect: '/profile' },
      })
      return
    }
    // Setting `user` flips `isAuthenticated` true and the composable's
    // watch picks it up to load linked accounts — no explicit refresh
    // call needed here.
    user.value = result.user
    profileForm.name = result.user.name
  }
  catch (error) {
    profileError.value = describeProfileError(error) || t('server.auth.profile.error.loadFailed')
  }
  finally {
    initialLoading.value = false
  }
})

async function handleSaveName(event: Event) {
  event.preventDefault()
  if (profileLoading.value || !user.value || !nameDirty.value)
    return

  profileError.value = null
  profileSuccess.value = null
  profileLoading.value = true

  const trimmed = profileForm.name.trim()
  try {
    await updateUserProfile({ apiServerUrl, name: trimmed })
    user.value = { ...user.value, name: trimmed }
    profileForm.name = trimmed
    profileSuccess.value = t('server.auth.profile.message.profileSaved')
  }
  catch (error) {
    profileError.value = describeProfileError(error) || t('server.auth.profile.error.saveFailed')
  }
  finally {
    profileLoading.value = false
  }
}

async function handleChangePassword(event: Event) {
  event.preventDefault()
  if (passwordLoading.value)
    return

  passwordError.value = null
  passwordSuccess.value = null

  if (passwordForm.next !== passwordForm.confirm) {
    passwordError.value = t('server.auth.profile.error.passwordMismatch')
    return
  }

  if (passwordForm.next === passwordForm.current) {
    passwordError.value = t('server.auth.profile.error.passwordSameAsCurrent')
    return
  }

  passwordLoading.value = true
  try {
    await changePassword({
      apiServerUrl,
      currentPassword: passwordForm.current,
      newPassword: passwordForm.next,
    })
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    passwordSuccess.value = t('server.auth.profile.message.passwordChanged')
  }
  catch (error) {
    passwordError.value = describeProfileError(error) || t('server.auth.profile.error.changePasswordFailed')
  }
  finally {
    passwordLoading.value = false
  }
}

async function handleSendSetPasswordLink() {
  if (setPasswordLoading.value || !user.value)
    return

  setPasswordLoading.value = true
  setPasswordError.value = null
  setPasswordSuccess.value = null

  try {
    // Land back on /auth/reset-password (the existing reset-password page
    // handles both initial-set and rotate flows because better-auth's
    // /reset-password endpoint creates a credential row when none exists).
    await requestPasswordReset({
      apiServerUrl,
      email: user.value.email,
      redirectTo: new URL('/auth/reset-password', window.location.origin).toString(),
    })
    setPasswordSuccess.value = t('server.auth.profile.password.setLinkSent', { email: user.value.email })
  }
  catch (error) {
    setPasswordError.value = describeProfileError(error)
      || t('server.auth.profile.password.setLinkFailed')
  }
  finally {
    setPasswordLoading.value = false
  }
}

async function handleSignOut() {
  if (signOutLoading.value)
    return

  signOutError.value = null
  signOutLoading.value = true

  try {
    await signOut({ apiServerUrl })
    await router.replace('/sign-in')
  }
  catch (error) {
    signOutError.value = describeProfileError(error) || t('server.auth.profile.error.signOutFailed')
    signOutLoading.value = false
  }
}

function handleUnlinkProvider(providerId: string) {
  const providerName = defaultSignInProviders.find(p => p.id === providerId)?.name ?? providerId
  return unlinkLinkedProvider(providerId, providerName)
}

function handleLinkProvider(providerId: 'github' | 'google') {
  const providerName = defaultSignInProviders.find(p => p.id === providerId)?.name ?? providerId
  return linkLinkedProvider(providerId, providerName)
}

function formatLinkedSince(iso: string): string {
  if (!iso)
    return ''
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(iso))
  }
  catch {
    return iso
  }
}
</script>

<template>
  <main
    :class="[
      'min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen',
    ]"
  >
    <div :class="['mb-2 text-3xl font-bold']">
      {{ t('server.auth.profile.title') }}
    </div>
    <div :class="['mb-6 max-w-sm text-center text-sm text-neutral-500']">
      {{ t('server.auth.profile.description') }}
    </div>

    <div
      v-if="initialLoading"
      :class="['max-w-sm w-full text-center text-sm text-neutral-500']"
    >
      {{ t('server.auth.profile.message.loading') }}
    </div>

    <template v-else-if="user">
      <!-- Avatar block: prefer user.image, fall back to Gravatar so the user
           always has a personalised picture even before they upload one. -->
      <section
        :class="['max-w-sm w-full flex flex-col items-center gap-2 mb-6']"
      >
        <div
          :class="[
            'h-24 w-24 overflow-hidden rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800',
          ]"
        >
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="t('server.auth.profile.avatar.altText')"
            :class="['h-full w-full object-cover']"
            referrerpolicy="no-referrer"
          >
        </div>
        <div
          v-if="usingGravatarFallback"
          :class="['flex flex-col items-center gap-1 text-center text-xs text-neutral-500']"
        >
          <span>{{ t('server.auth.profile.avatar.gravatarNotice') }}</span>
          <a
            v-if="gravatarProfileUrl"
            :href="gravatarProfileUrl"
            target="_blank"
            rel="noreferrer"
            :class="['underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300']"
          >
            {{ t('server.auth.profile.avatar.gravatarLink') }}
          </a>
        </div>
      </section>

      <!-- Identity summary: read-only fields (email, verification, created at) -->
      <section
        :class="['max-w-sm w-full flex flex-col gap-2 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 mb-6']"
      >
        <div :class="['flex items-center justify-between text-sm']">
          <span :class="['text-neutral-500']">{{ t('server.auth.profile.field.email') }}</span>
          <span :class="['font-medium']">{{ user.email }}</span>
        </div>
        <div :class="['flex items-center justify-between text-sm']">
          <span :class="['text-neutral-500']">{{ t('server.auth.profile.field.emailVerified') }}</span>
          <span
            :class="[
              'rounded px-2 py-0.5 text-xs',
              user.emailVerified
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
            ]"
          >
            {{
              user.emailVerified
                ? t('server.auth.profile.label.verified')
                : t('server.auth.profile.label.unverified')
            }}
          </span>
        </div>
        <div
          v-if="formattedCreatedAt"
          :class="['flex items-center justify-between text-sm']"
        >
          <span :class="['text-neutral-500']">{{ t('server.auth.profile.field.createdAt') }}</span>
          <span :class="['font-medium']">{{ formattedCreatedAt }}</span>
        </div>
      </section>

      <!-- Display name form -->
      <form
        :class="['max-w-sm w-full flex flex-col gap-3 mb-6']"
        @submit="handleSaveName"
      >
        <h2 :class="['text-base font-semibold']">
          {{ t('server.auth.profile.section.profile') }}
        </h2>

        <FieldInput
          v-model="profileForm.name"
          type="text"
          :label="t('server.auth.profile.name.label')"
          :placeholder="t('server.auth.profile.name.placeholder')"
        />

        <div
          v-if="profileError"
          :class="['text-sm text-red-500']"
          role="alert"
          aria-live="polite"
        >
          {{ profileError }}
        </div>
        <div
          v-else-if="profileSuccess"
          :class="['text-sm text-green-600 dark:text-green-400']"
          aria-live="polite"
        >
          {{ profileSuccess }}
        </div>

        <Button
          type="submit"
          :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
          :loading="profileLoading"
          :disabled="!nameDirty"
        >
          <span>{{ t('server.auth.profile.action.saveProfile') }}</span>
        </Button>
      </form>

      <!-- Password section: branches on whether the user already has a
           credential account. Social-only users (signed up via GitHub /
           Google) have no current password to type, so we drive them
           through the email-based set-password flow instead of showing a
           form they can't fill. -->
      <section
        v-if="!linkedAccountsLoading"
        :class="['max-w-sm w-full flex flex-col gap-3 mb-6']"
      >
        <h2 :class="['text-base font-semibold']">
          {{ t('server.auth.profile.section.password') }}
        </h2>

        <form
          v-if="hasCredentialAccount"
          :class="['flex flex-col gap-3']"
          @submit="handleChangePassword"
        >
          <FieldInput
            v-model="passwordForm.current"
            type="password"
            :label="t('server.auth.profile.password.currentLabel')"
            :placeholder="t('server.auth.profile.password.currentPlaceholder')"
            required
            hide-required-mark
          />
          <FieldInput
            v-model="passwordForm.next"
            type="password"
            :label="t('server.auth.profile.password.newLabel')"
            :placeholder="t('server.auth.profile.password.newPlaceholder')"
            required
            hide-required-mark
          />
          <FieldInput
            v-model="passwordForm.confirm"
            type="password"
            :label="t('server.auth.profile.password.confirmLabel')"
            :placeholder="t('server.auth.profile.password.confirmPlaceholder')"
            required
            hide-required-mark
          />

          <div
            v-if="passwordError"
            :class="['text-sm text-red-500']"
            role="alert"
            aria-live="polite"
          >
            {{ passwordError }}
          </div>
          <div
            v-else-if="passwordSuccess"
            :class="['text-sm text-green-600 dark:text-green-400']"
            aria-live="polite"
          >
            {{ passwordSuccess }}
          </div>

          <Button
            type="submit"
            :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
            :loading="passwordLoading"
          >
            <span>{{ t('server.auth.profile.action.changePassword') }}</span>
          </Button>
        </form>

        <div
          v-else
          :class="['flex flex-col gap-3']"
        >
          <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('server.auth.profile.password.setDescription') }}
          </p>

          <div
            v-if="setPasswordError"
            :class="['text-sm text-red-500']"
            role="alert"
            aria-live="polite"
          >
            {{ setPasswordError }}
          </div>
          <div
            v-else-if="setPasswordSuccess"
            :class="['text-sm text-green-600 dark:text-green-400']"
            aria-live="polite"
          >
            {{ setPasswordSuccess }}
          </div>

          <Button
            :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
            :loading="setPasswordLoading"
            :disabled="!!setPasswordSuccess"
            @click="handleSendSetPasswordLink"
          >
            <span>{{ t('server.auth.profile.action.sendSetPasswordLink') }}</span>
          </Button>
        </div>
      </section>

      <!-- Connected accounts: list each known social provider with its
           bind/unbind affordance. Re-binding is just unlink + link in
           sequence; we surface that flow via the i18n description rather
           than a dedicated button to keep the UI predictable. -->
      <section :class="['max-w-sm w-full flex flex-col gap-3 mb-6']">
        <h2 :class="['text-base font-semibold']">
          {{ t('server.auth.profile.section.linkedAccounts') }}
        </h2>
        <p :class="['text-xs text-neutral-500']">
          {{ t('server.auth.profile.linkedAccounts.description') }}
        </p>

        <div
          v-if="linkedAccountsLoading"
          :class="['text-sm text-neutral-500']"
        >
          {{ t('server.auth.profile.linkedAccounts.message.loading') }}
        </div>

        <ul
          v-else
          :class="['flex flex-col gap-2']"
        >
          <li
            v-for="provider in defaultSignInProviders"
            :key="provider.id"
            :class="[
              'flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2',
            ]"
          >
            <div :class="['flex items-center gap-2 min-w-0']">
              <span :class="[provider.icon, 'h-5 w-5 shrink-0']" aria-hidden="true" />
              <div :class="['flex flex-col min-w-0']">
                <span :class="['truncate text-sm font-medium']">{{ provider.name }}</span>
                <span :class="['truncate text-xs text-neutral-500']">
                  <template v-if="linkedAccountsByProvider.get(provider.id)">
                    {{
                      t('server.auth.profile.linkedAccounts.status.linkedSince', {
                        date: formatLinkedSince(linkedAccountsByProvider.get(provider.id)!.createdAt),
                      })
                    }}
                  </template>
                  <template v-else>
                    {{ t('server.auth.profile.linkedAccounts.status.notLinked') }}
                  </template>
                </span>
              </div>
            </div>

            <Button
              v-if="linkedAccountsByProvider.get(provider.id)"
              variant="secondary"
              :class="['shrink-0 px-3 py-1 text-xs']"
              :loading="linkActionInFlight === provider.id"
              :disabled="!!linkActionInFlight && linkActionInFlight !== provider.id"
              @click="handleUnlinkProvider(provider.id)"
            >
              <span>{{ t('server.auth.profile.linkedAccounts.action.unlink') }}</span>
            </Button>
            <Button
              v-else
              :class="['shrink-0 px-3 py-1 text-xs']"
              :loading="linkActionInFlight === provider.id"
              :disabled="!!linkActionInFlight && linkActionInFlight !== provider.id"
              @click="handleLinkProvider(provider.id)"
            >
              <span>{{ t('server.auth.profile.linkedAccounts.action.link') }}</span>
            </Button>
          </li>
        </ul>

        <div
          v-if="linkedAccountsError"
          :class="['text-sm text-red-500']"
          role="alert"
          aria-live="polite"
        >
          {{ linkedAccountsError }}
        </div>
        <div
          v-else-if="linkedAccountsMessage"
          :class="['text-sm text-green-600 dark:text-green-400']"
          aria-live="polite"
        >
          {{ linkedAccountsMessage }}
        </div>
      </section>

      <!-- Sign out -->
      <div :class="['max-w-sm w-full flex flex-col gap-2']">
        <Button
          :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
          variant="secondary"
          :loading="signOutLoading"
          @click="handleSignOut"
        >
          <span>{{ t('server.auth.profile.action.signOut') }}</span>
        </Button>
        <div
          v-if="signOutError"
          :class="['text-sm text-red-500 text-center']"
          role="alert"
          aria-live="polite"
        >
          {{ signOutError }}
        </div>
      </div>
    </template>

    <!-- No user, no longer initial loading: bootstrap error happened. The
         router.replace already fired for unauthenticated; this branch is for
         the network/error case so the user isn't stuck on a blank page. -->
    <div
      v-else
      :class="['max-w-sm w-full text-center text-sm text-red-500']"
    >
      {{ profileError || t('server.auth.profile.error.loadFailed') }}
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
