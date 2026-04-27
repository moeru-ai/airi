<script setup lang="ts">
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { Button, FieldInput } from '@proj-airi/ui'
import { reactive, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { describeAuthError, requestPasswordReset } from '../modules/email-password'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'

const { t } = useI18n()

const bootstrapContext = getServerAuthBootstrapContext()
const apiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL

// Reset link must redirect back into ui-server-auth itself. Use the current
// origin so dev (localhost) and prod (auth.airi…) both resolve correctly.
const resetRedirect = `${window.location.origin}/_ui/server-auth/reset-password`

const form = reactive({ email: '' })
const errorMessage = shallowRef<string | null>(null)
const loading = shallowRef(false)
const submitted = shallowRef(false)

async function handleSubmit(event: Event) {
  event.preventDefault()
  if (loading.value)
    return

  errorMessage.value = null
  loading.value = true

  try {
    await requestPasswordReset({
      apiServerUrl,
      email: form.email.trim(),
      redirectTo: resetRedirect,
    })
    submitted.value = true
  }
  catch (error) {
    errorMessage.value = describeAuthError(error) || t('server.auth.forgotPassword.error.fallback')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <main
    :class="[
      'min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen',
    ]"
  >
    <div :class="['mb-6 text-2xl font-bold']">
      {{ t('server.auth.forgotPassword.title') }}
    </div>

    <p
      v-if="!submitted"
      :class="['mb-6 max-w-sm text-center text-sm text-neutral-600 dark:text-neutral-300']"
    >
      {{ t('server.auth.forgotPassword.description') }}
    </p>

    <form
      v-if="!submitted"
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="handleSubmit"
    >
      <FieldInput
        v-model="form.email"
        type="email"
        :label="t('server.auth.forgotPassword.email.label')"
        :placeholder="t('server.auth.forgotPassword.email.placeholder')"
        required
      />
      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="loading"
      >
        <span>{{ t('server.auth.forgotPassword.action.send') }}</span>
      </Button>
    </form>

    <div
      v-else
      :class="['max-w-sm text-center text-sm text-neutral-600 dark:text-neutral-300']"
    >
      {{ t('server.auth.forgotPassword.message.sent', { email: form.email.trim() }) }}
    </div>

    <div
      v-if="errorMessage"
      :class="['mt-4 max-w-xs w-full text-center text-sm text-red-500']"
    >
      {{ errorMessage }}
    </div>

    <RouterLink
      to="/sign-in"
      :class="['mt-8 text-xs text-neutral-500 underline']"
    >
      {{ t('server.auth.forgotPassword.action.backToSignIn') }}
    </RouterLink>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
