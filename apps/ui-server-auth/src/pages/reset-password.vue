<script setup lang="ts">
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { Button, FieldInput } from '@proj-airi/ui'
import { computed, reactive, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { describeAuthError, resetPasswordWithToken } from '../modules/email-password'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const bootstrapContext = getServerAuthBootstrapContext()
const apiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL

// better-auth's reset-password landing GET endpoint redirects here with
// `?token=...` after validating the link's existence. We submit token + new
// password to /reset-password POST.
const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' ? value : ''
})

const form = reactive({ password: '', confirmPassword: '' })
const errorMessage = shallowRef<string | null>(null)
const loading = shallowRef(false)
const completed = shallowRef(false)

async function handleSubmit(event: Event) {
  event.preventDefault()
  if (loading.value)
    return

  errorMessage.value = null

  if (!token.value) {
    errorMessage.value = t('server.auth.resetPassword.error.missingToken')
    return
  }

  if (form.password !== form.confirmPassword) {
    errorMessage.value = t('server.auth.resetPassword.error.passwordMismatch')
    return
  }

  loading.value = true
  try {
    await resetPasswordWithToken({
      apiServerUrl,
      newPassword: form.password,
      token: token.value,
    })
    completed.value = true
  }
  catch (error) {
    errorMessage.value = describeAuthError(error) || t('server.auth.resetPassword.error.fallback')
  }
  finally {
    loading.value = false
  }
}

async function goSignIn() {
  await router.push('/sign-in')
}
</script>

<template>
  <main
    :class="[
      'min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen',
    ]"
  >
    <div :class="['mb-6 text-2xl font-bold']">
      {{
        completed
          ? t('server.auth.resetPassword.title.success')
          : t('server.auth.resetPassword.title.default')
      }}
    </div>

    <form
      v-if="!completed"
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="handleSubmit"
    >
      <FieldInput
        v-model="form.password"
        type="password"
        :label="t('server.auth.resetPassword.password.label')"
        :placeholder="t('server.auth.resetPassword.password.placeholder')"
        required
      />
      <FieldInput
        v-model="form.confirmPassword"
        type="password"
        :label="t('server.auth.resetPassword.confirmPassword.label')"
        :placeholder="t('server.auth.resetPassword.confirmPassword.placeholder')"
        required
      />
      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="loading"
      >
        <span>{{ t('server.auth.resetPassword.action.reset') }}</span>
      </Button>
    </form>

    <div
      v-else
      :class="['max-w-sm flex flex-col items-center gap-4 text-center text-sm']"
    >
      <p :class="['text-neutral-600 dark:text-neutral-300']">
        {{ t('server.auth.resetPassword.message.success') }}
      </p>
      <Button @click="goSignIn">
        <span>{{ t('server.auth.resetPassword.action.goSignIn') }}</span>
      </Button>
    </div>

    <div
      v-if="errorMessage"
      :class="['mt-4 max-w-xs w-full text-center text-sm text-red-500']"
    >
      {{ errorMessage }}
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
