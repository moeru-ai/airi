<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
import { Button, FieldInput } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useEmailAuthFlow } from '../composables/useEmailAuthFlow'

const props = defineProps<{
  apiServerUrl: string
  callbackUrl: string
  verifyContinueUrl: string
  scope: 'signIn' | 'enroll'
  requestedProvider?: OAuthProvider | null
}>()

const { t } = useI18n()

const flow = useEmailAuthFlow({
  apiServerUrl: props.apiServerUrl,
  callbackUrl: props.callbackUrl,
  verifyContinueUrl: props.verifyContinueUrl,
  requestedProvider: props.requestedProvider,
})

const heading = computed(() => {
  if (flow.step.value === 'password')
    return t(`server.auth.${props.scope}.step.password.heading`)
  if (flow.step.value === 'create')
    return t(`server.auth.${props.scope}.step.create.heading`)
  return t(`server.auth.${props.scope}.step.identify.heading`)
})

const description = computed(() => {
  if (flow.step.value === 'password')
    return t(`server.auth.${props.scope}.step.password.description`, { email: flow.credentials.email })
  if (flow.step.value === 'create')
    return t(`server.auth.${props.scope}.step.create.description`, { email: flow.credentials.email })
  return t(`server.auth.${props.scope}.step.identify.description`)
})
</script>

<template>
  <main :class="['min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen']">
    <slot name="banner" />

    <div :class="['mb-2 text-3xl font-bold']">
      {{ heading }}
    </div>
    <div :class="['mb-4 max-w-xs text-center text-sm text-neutral-500']">
      {{ description }}
    </div>

    <div
      :class="[
        'mb-2 max-w-sm w-full min-h-[1.25rem] text-center text-sm',
        flow.errorMessage.value ? 'text-red-500' : 'text-transparent select-none',
      ]"
      :role="flow.errorMessage.value ? 'alert' : undefined"
      :aria-live="flow.errorMessage.value ? 'polite' : undefined"
    >
      {{ flow.errorMessage.value || '·' }}
    </div>

    <!-- Step 1: identify -->
    <form
      v-if="flow.step.value === 'identify'"
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="flow.handleIdentify"
    >
      <FieldInput
        v-model="flow.credentials.email"
        type="email"
        :label="t('server.auth.signIn.email.label')"
        :placeholder="t('server.auth.signIn.email.placeholder')"
        required
        hide-required-mark
      />
      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="flow.identifierLoading.value"
      >
        <span>{{ t('server.auth.signIn.action.continue') }}</span>
      </Button>
    </form>

    <!-- Step 2A: existing user, password -->
    <form
      v-else-if="flow.step.value === 'password'"
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="flow.handleEmailSignIn"
    >
      <FieldInput
        v-model="flow.credentials.password"
        type="password"
        :label="t('server.auth.signIn.password.label')"
        :placeholder="t('server.auth.signIn.password.placeholder')"
        required
        hide-required-mark
      />
      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="flow.credentialsLoading.value"
      >
        <span>{{ t('server.auth.signIn.action.signIn') }}</span>
      </Button>
      <div :class="['flex items-center justify-between text-xs text-neutral-500']">
        <RouterLink to="/forgot-password" :class="['underline']">
          {{ t('server.auth.signIn.action.forgotPassword') }}
        </RouterLink>
        <button type="button" :class="['underline']" @click="flow.backToIdentify">
          {{ t('server.auth.signIn.action.useDifferentEmail') }}
        </button>
      </div>
    </form>

    <!-- Step 2B: new user, sign up -->
    <form
      v-else
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="flow.handleEmailSignUp"
    >
      <FieldInput
        v-model="flow.credentials.name"
        type="text"
        :label="t('server.auth.signIn.name.label')"
        :placeholder="t('server.auth.signIn.name.placeholder')"
      />
      <FieldInput
        v-model="flow.credentials.password"
        type="password"
        :label="t('server.auth.signIn.newPassword.label')"
        :placeholder="t('server.auth.signIn.newPassword.placeholder')"
        required
        hide-required-mark
      />
      <FieldInput
        v-model="flow.credentials.confirmPassword"
        type="password"
        :label="t('server.auth.signIn.confirmPassword.label')"
        :placeholder="t('server.auth.signIn.confirmPassword.placeholder')"
        required
        hide-required-mark
      />
      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="flow.credentialsLoading.value"
      >
        <span>{{ t('server.auth.signIn.action.createAccount') }}</span>
      </Button>
      <div :class="['flex items-center justify-end text-xs text-neutral-500']">
        <button type="button" :class="['underline']" @click="flow.backToIdentify">
          {{ t('server.auth.signIn.action.useDifferentEmail') }}
        </button>
      </div>
    </form>

    <!-- OAuth buttons: only on identifier step. -->
    <template v-if="flow.step.value === 'identify'">
      <div :class="['my-6 max-w-xs w-full flex items-center gap-3 text-xs text-neutral-400']">
        <div :class="['h-px flex-1 bg-neutral-200 dark:bg-neutral-700']" />
        <span>{{ t('server.auth.signIn.divider.or') }}</span>
        <div :class="['h-px flex-1 bg-neutral-200 dark:bg-neutral-700']" />
      </div>

      <div :class="['max-w-xs w-full flex flex-col gap-3']">
        <Button
          v-for="provider in defaultSignInProviders"
          :key="provider.id"
          :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
          :icon="provider.id === 'google' ? 'i-simple-icons-google' : provider.id === 'github' ? 'i-simple-icons-github' : undefined"
          :loading="flow.pendingProvider.value === provider.id"
          @click="flow.handleProviderSelect(provider.id)"
        >
          <span>{{ provider.name }}</span>
        </Button>
      </div>
    </template>

    <div :class="['mt-8 text-center text-xs text-gray-400']">
      {{ t('server.auth.signIn.footer.prefix') }}
      <a href="https://airi.moeru.ai/docs/en/about/terms" :class="['underline']">
        {{ t('server.auth.signIn.footer.terms') }}
      </a>
      {{ t('server.auth.signIn.footer.and') }}
      <a href="https://airi.moeru.ai/docs/en/about/privacy" :class="['underline']">
        {{ t('server.auth.signIn.footer.privacy') }}
      </a>.
    </div>
  </main>
</template>
