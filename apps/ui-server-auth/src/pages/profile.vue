<script setup lang="ts">
import type { ProfileUser } from '../modules/profile'

import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { Button, FieldInput } from '@proj-airi/ui'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

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

const signOutLoading = shallowRef(false)
const signOutError = shallowRef<string | null>(null)

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

      <!-- Change password form -->
      <form
        :class="['max-w-sm w-full flex flex-col gap-3 mb-6']"
        @submit="handleChangePassword"
      >
        <h2 :class="['text-base font-semibold']">
          {{ t('server.auth.profile.section.password') }}
        </h2>

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
