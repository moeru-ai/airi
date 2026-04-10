<script setup lang="ts">
import { Button, Callout } from '@proj-airi/ui'
import { onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { parseElectronCallbackQuery } from '../composables/electron-callback.shared'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'

type CallbackStatus = 'loading' | 'success' | 'fallback' | 'error'

interface CallbackViewModel {
  status: CallbackStatus
  title: string
  description: string
  detail?: string
  primaryActionLabel?: string
  primaryActionDisabled?: boolean
  relayUrl?: string
  showCloseTabHint?: boolean
}

const { t } = useI18n()

const viewModel = shallowRef<CallbackViewModel>({
  description: t('server.auth.electronCallback.message.checkingResponse'),
  primaryActionDisabled: true,
  status: 'loading',
  title: t('server.auth.electronCallback.title.loading'),
})

function setViewModel(next: CallbackViewModel) {
  viewModel.value = next
}

function openRelayUrl() {
  if (!viewModel.value.relayUrl)
    return

  window.location.assign(viewModel.value.relayUrl)
}

async function runRelayFlow() {
  const bootstrapContext = getServerAuthBootstrapContext()
  const callbackContext = bootstrapContext?.oidcCallback

  const query = callbackContext
    ? new URLSearchParams({
        code: callbackContext.code,
        error: callbackContext.error,
        error_description: callbackContext.errorDescription,
        state: callbackContext.state,
      })
    : new URLSearchParams(window.location.search)

  const parsed = parseElectronCallbackQuery(query)

  if (parsed.status === 'error') {
    setViewModel({
      description: t('server.auth.electronCallback.message.invalidResponse'),
      detail: parsed.message,
      status: 'error',
      title: t('server.auth.electronCallback.title.signInFailed'),
    })
    return
  }

  setViewModel({
    description: t('server.auth.electronCallback.message.passingToAiri'),
    primaryActionDisabled: true,
    relayUrl: parsed.relayUrl,
    status: 'loading',
    title: t('server.auth.electronCallback.title.openingAiri'),
  })

  try {
    await fetch(parsed.relayUrl)

    setViewModel({
      description: t('server.auth.electronCallback.message.syncedAndSafeToClose'),
      relayUrl: parsed.relayUrl,
      showCloseTabHint: false,
      status: 'success',
      title: t('server.auth.electronCallback.title.signedIn'),
    })

    window.setTimeout(() => {
      window.close()
    }, 480)

    window.setTimeout(() => {
      setViewModel({
        description: t('server.auth.electronCallback.message.syncedAndSafeToClose'),
        relayUrl: parsed.relayUrl,
        showCloseTabHint: true,
        status: 'success',
        title: t('server.auth.electronCallback.title.signedIn'),
      })
    }, 1200)
  }
  catch {
    setViewModel({
      description: t('server.auth.electronCallback.message.loopbackUnreachable'),
      detail: t('server.auth.electronCallback.message.tryOpenDirectly'),
      primaryActionDisabled: false,
      primaryActionLabel: t('server.auth.electronCallback.action.openAiriManually'),
      relayUrl: parsed.relayUrl,
      status: 'fallback',
      title: t('server.auth.electronCallback.title.finishSignInInAiri'),
    })

    window.setTimeout(() => {
      window.location.replace(parsed.relayUrl)
    }, 180)

    window.setTimeout(() => {
      setViewModel({
        description: t('server.auth.electronCallback.message.automaticHandoffFailed'),
        detail: parsed.relayUrl,
        primaryActionDisabled: false,
        primaryActionLabel: t('server.auth.electronCallback.action.openAiriManually'),
        relayUrl: parsed.relayUrl,
        status: 'fallback',
        title: t('server.auth.electronCallback.title.openAiriToContinue'),
      })
    }, 960)
  }
}

onMounted(() => {
  void runRelayFlow()
})
</script>

<template>
  <main :class="['min-h-screen', 'flex flex-col items-center justify-center', 'px-6 py-10', 'font-cuteen']">
    <div v-if="viewModel.status === 'loading'" :class="['text-center']">
      <div
        aria-hidden="true"
        :class="[
          'mx-auto mb-3',
          'h-15 w-15',
          'i-svg-spinners:ring-resize',
          'text-primary-500',
        ]"
      />
      <div :class="['text-lg']">
        {{ viewModel.title }}
      </div>
      <p :class="['mt-2 text-sm text-neutral-600 dark:text-neutral-300']">
        {{ viewModel.description }}
      </p>
    </div>

    <div v-else :class="['sm:max-w-md md:max-w-lg', 'flex w-full flex-col items-center']">
      <div :class="['mb-8 text-3xl font-bold']">
        {{ t('server.auth.electronCallback.label.signIn') }}
      </div>

      <div
        v-if="viewModel.status === 'success'"
        :class="[
          'w-full rounded-xl border-2 border-green-200/45 bg-green-50/70 p-4',
          'relative', 'overflow-hidden',
          'dark:border-green-800/30 dark:bg-green-950/30',
        ]"
      >
        <div :class="['flex items-start gap-3']">
          <div
            aria-hidden="true"
            :class="[
              'absolute',
              'size-30 flex-shrink-0',
              'right-0 top-0 translate-x-[calc(25%)] translate-y-[-25%]',
              'i-solar:check-circle-line-duotone text-green-500 dark:text-green-400 op-25',
            ]"
          />
          <div :class="['min-w-0']">
            <div :class="['text-lg font-semibold text-green-800 dark:text-green-200', 'mb-4']">
              {{ viewModel.title }}
            </div>
            <div :class="['mt-1 text-sm text-green-700 dark:text-green-300']">
              {{ viewModel.description }}
            </div>
            <div :class="['mt-2 text-xs text-green-700/90 dark:text-green-300/90']">
              {{ t('server.auth.electronCallback.label.safeToClose') }}
            </div>
            <div
              v-if="viewModel.detail"
              :class="['mt-2 break-all text-xs text-green-700/85 dark:text-green-300/85']"
            >
              {{ viewModel.detail }}
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        :class="[
          'w-full rounded-xl border-2 border-orange-200/45 bg-orange-50/70 p-4',
          'relative', 'overflow-hidden',
          'dark:border-orange-800/30 dark:bg-orange-950/30',
        ]"
      >
        <div :class="['flex items-start gap-3']">
          <div
            aria-hidden="true"
            :class="[
              'absolute',
              'size-30 flex-shrink-0',
              'right-0 top-0 translate-x-[calc(25%)] translate-y-[-25%]',
              'i-solar:danger-circle-line-duotone text-orange-500 dark:text-orange-400 op-25',
            ]"
          />
          <div :class="['min-w-0']">
            <div :class="['text-lg font-semibold text-orange-800 dark:text-orange-200', 'mb-4']">
              {{ viewModel.title }}
            </div>
            <div :class="['mt-1 text-sm text-orange-700 dark:text-orange-300']">
              {{ viewModel.description }}
            </div>
            <div
              v-if="viewModel.detail"
              :class="['mt-2 break-all text-xs text-orange-700/90 dark:text-orange-300/90']"
            >
              {{ viewModel.detail }}
            </div>
          </div>
        </div>
      </div>

      <Callout
        v-if="viewModel.status === 'success' && viewModel.showCloseTabHint"
        theme="primary"
        :class="['mt-3 w-full']"
        :label="t('server.auth.electronCallback.label.whyStillHere')"
      >
        <div :class="['mt-1 text-sm']">
          {{ t('server.auth.electronCallback.hint.closeTabManually') }}
        </div>
      </Callout>

      <div :class="['mt-3 flex flex-wrap items-center justify-center gap-2']">
        <Button
          v-if="viewModel.primaryActionLabel"
          :disabled="viewModel.primaryActionDisabled"
          :class="['inline-flex']"
          @click="openRelayUrl"
        >
          {{ viewModel.primaryActionLabel }}
        </Button>
      </div>

      <a
        v-if="viewModel.relayUrl && viewModel.status === 'fallback'"
        :class="[
          'mt-4 block break-all text-xs text-neutral-500 underline decoration-dotted underline-offset-4',
          'hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
        ]"
        :href="viewModel.relayUrl"
      >
        {{ viewModel.relayUrl }}
      </a>
    </div>
  </main>
</template>

<route lang="yaml">
alias:
  - /electron-callback
meta:
  layout: plain
path: /api/auth/oidc/electron-callback
</route>
