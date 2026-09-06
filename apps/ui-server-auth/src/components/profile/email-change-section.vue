<script setup lang="ts">
import { Button, FieldInput } from '@proj-airi/ui'
import { computed, onUnmounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { AuthFetchError } from '../../modules/auth-fetch'
import { buildCurrentOriginAuthUiUrl } from '../../modules/auth-ui-base'
import { changeEmail } from '../../modules/email-change'
import { isPlaceholderEmail } from '../../modules/profile'

type EmailChangeViewState
  = { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'accepted', destination: 'current' | 'new' }
    | { status: 'error', code: string | null }

interface Props {
  apiServerUrl: string
  email: string
  emailVerified: boolean
}

interface Emits {
  submitted: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const newEmail = shallowRef('')
const submittedEmail = shallowRef('')
const resendCooldownSeconds = shallowRef(0)
const state = shallowRef<EmailChangeViewState>({ status: 'idle' })
let resendCooldownTimer: number | null = null
let requestGeneration = 0
let disposed = false

const placeholderEmail = computed(() => isPlaceholderEmail(props.email))
const title = computed(() => t(placeholderEmail.value
  ? 'server.auth.profile.emailChange.title.add'
  : 'server.auth.profile.emailChange.title.change'))
const description = computed(() => t(placeholderEmail.value
  ? 'server.auth.profile.emailChange.description.add'
  : 'server.auth.profile.emailChange.description.change'))
const submitLabel = computed(() => {
  if (state.value.status === 'error')
    return t('server.auth.profile.emailChange.action.retry')

  return t(placeholderEmail.value
    ? 'server.auth.profile.emailChange.action.add'
    : 'server.auth.profile.emailChange.action.change')
})
const errorMessage = computed(() => {
  if (state.value.status !== 'error')
    return null

  if (state.value.code === 'EMAIL_CHANGE_EMAIL_UNAVAILABLE')
    return t('server.auth.profile.emailChange.error.unavailable')

  if (state.value.code === 'TOO_MANY_REQUESTS')
    return t('server.auth.profile.emailChange.error.rateLimited')

  return t('server.auth.profile.emailChange.error.request')
})

onUnmounted(() => {
  disposed = true
  requestGeneration += 1
  stopResendCooldown()
})

async function handleSubmit() {
  if (state.value.status === 'submitting')
    return

  const targetEmail = newEmail.value.trim()
  if (!targetEmail)
    return

  submittedEmail.value = targetEmail
  await submitEmailChange(targetEmail)
}

async function handleResend() {
  if (
    state.value.status !== 'accepted'
    || resendCooldownSeconds.value > 0
    || !submittedEmail.value
  ) {
    return
  }

  await submitEmailChange(submittedEmail.value)
}

async function submitEmailChange(targetEmail: string) {
  const generation = ++requestGeneration
  state.value = { status: 'submitting' }

  const callbackURL = new URL(buildCurrentOriginAuthUiUrl('/profile'))
  callbackURL.searchParams.set('email_change', 'processed')

  try {
    await changeEmail({
      apiServerUrl: props.apiServerUrl,
      callbackURL: callbackURL.toString(),
      newEmail: targetEmail,
    })

    if (!isCurrentRequest(generation))
      return

    state.value = {
      status: 'accepted',
      destination: props.emailVerified ? 'current' : 'new',
    }
    startResendCooldown()
    emit('submitted')
  }
  catch (error) {
    if (!isCurrentRequest(generation))
      return

    state.value = {
      status: 'error',
      code: error instanceof AuthFetchError ? error.code : null,
    }
  }
}

function isCurrentRequest(generation: number) {
  return !disposed && generation === requestGeneration
}

function startResendCooldown() {
  stopResendCooldown()
  resendCooldownSeconds.value = 60
  resendCooldownTimer = window.setInterval(() => {
    resendCooldownSeconds.value -= 1
    if (resendCooldownSeconds.value <= 0)
      stopResendCooldown()
  }, 1_000)
}

function stopResendCooldown() {
  if (resendCooldownTimer !== null) {
    window.clearInterval(resendCooldownTimer)
    resendCooldownTimer = null
  }
}
</script>

<template>
  <section
    :aria-label="title"
    :class="[
      'max-w-sm w-full flex flex-col gap-4',
      'rounded-xl border border-neutral-200 p-4 dark:border-neutral-800',
    ]"
  >
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-base font-semibold']">
        {{ title }}
      </h2>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ description }}
      </p>
    </div>

    <div
      v-if="!placeholderEmail"
      :class="[
        'flex items-center justify-between gap-3',
        'text-sm',
      ]"
    >
      <span :class="['text-neutral-500 dark:text-neutral-400']">
        {{ t('server.auth.profile.emailChange.current.label') }}
      </span>
      <span :class="['min-w-0 flex items-center gap-2']">
        <span :class="['truncate font-medium']">{{ props.email }}</span>
        <span
          :class="[
            'shrink-0 rounded-full px-2 py-0.5 text-xs',
            props.emailVerified
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
          ]"
        >
          {{ t(props.emailVerified
            ? 'server.auth.profile.emailChange.current.verified'
            : 'server.auth.profile.emailChange.current.unverified') }}
        </span>
      </span>
    </div>

    <form
      v-if="state.status !== 'accepted'"
      :class="['flex flex-col gap-3']"
      @submit.prevent="handleSubmit"
    >
      <FieldInput
        v-model="newEmail"
        autocomplete="email"
        required
        type="email"
        :label="t('server.auth.profile.emailChange.input.label')"
        :placeholder="t('server.auth.profile.emailChange.input.placeholder')"
      />

      <p
        v-if="errorMessage"
        :class="['text-sm text-red-500']"
        role="alert"
        aria-live="polite"
      >
        {{ errorMessage }}
      </p>

      <Button
        type="submit"
        color="primary"
        variant="primary"
        :class="[
          'w-full py-2',
          'flex items-center justify-center',
        ]"
        :loading="state.status === 'submitting'"
      >
        {{ submitLabel }}
      </Button>
    </form>

    <div
      v-else
      :class="['flex flex-col gap-3']"
    >
      <p
        :class="['text-sm']"
        role="status"
        aria-live="polite"
      >
        {{ t(state.destination === 'current'
          ? 'server.auth.profile.emailChange.accepted.current'
          : 'server.auth.profile.emailChange.accepted.new') }}
      </p>
      <Button
        type="button"
        :class="[
          'w-full py-2',
          'flex items-center justify-center',
        ]"
        :disabled="resendCooldownSeconds > 0"
        @click="handleResend"
      >
        {{ resendCooldownSeconds > 0
          ? t('server.auth.profile.emailChange.action.resendIn', { seconds: resendCooldownSeconds })
          : t('server.auth.profile.emailChange.action.resend') }}
      </Button>
    </div>
  </section>
</template>
