<script setup lang="ts">
import { BackgroundGradientOverlay } from '@proj-airi/stage-ui/components'
import { onMounted, shallowRef } from 'vue'

import AuthNotice from '../components/auth-notice.vue'

import { parseElectronCallbackQuery } from '../composables/electron-callback.shared'

type CallbackStatus = 'loading' | 'success' | 'fallback' | 'error'

interface CallbackViewModel {
  status: CallbackStatus
  title: string
  description: string
  detail?: string
  primaryActionLabel?: string
  secondaryActionLabel?: string
  primaryActionDisabled?: boolean
  relayUrl?: string
}

const viewModel = shallowRef<CallbackViewModel>({
  description: 'Checking your sign-in response and preparing the handoff to AIRI.',
  primaryActionDisabled: true,
  status: 'loading',
  title: 'Completing sign-in',
})

function setViewModel(next: CallbackViewModel) {
  viewModel.value = next
}

function openRelayUrl() {
  if (!viewModel.value.relayUrl)
    return

  window.location.assign(viewModel.value.relayUrl)
}

function copyRelayUrl() {
  if (!viewModel.value.relayUrl)
    return

  void navigator.clipboard?.writeText(viewModel.value.relayUrl)
}

async function runRelayFlow() {
  const parsed = parseElectronCallbackQuery(new URLSearchParams(window.location.search))

  if (parsed.status === 'error') {
    setViewModel({
      description: 'We could not use this sign-in response.',
      detail: parsed.message,
      status: 'error',
      title: 'Sign-in failed',
    })
    return
  }

  setViewModel({
    description: 'Passing your sign-in back to AIRI now. This page should close in a moment.',
    primaryActionDisabled: true,
    relayUrl: parsed.relayUrl,
    status: 'loading',
    title: 'Opening AIRI',
  })

  try {
    await fetch(parsed.relayUrl)

    setViewModel({
      description: 'AIRI accepted the sign-in response. This tab will try to close itself now.',
      detail: 'If nothing happens, you can close this tab manually and return to AIRI.',
      relayUrl: parsed.relayUrl,
      status: 'success',
      title: 'You are signed in',
    })

    window.setTimeout(() => {
      window.close()
    }, 480)

    window.setTimeout(() => {
      setViewModel({
        description: 'AIRI accepted the sign-in response. You can close this tab and continue in the app.',
        detail: 'Some browsers do not allow this page to close itself automatically.',
        relayUrl: parsed.relayUrl,
        secondaryActionLabel: 'Copy callback link',
        status: 'success',
        title: 'You are signed in',
      })
    }, 1200)
  }
  catch {
    setViewModel({
      description: 'The browser could not reach AIRI through the local callback port.',
      detail: 'We will try opening the local handoff directly. If that still fails, use the button below.',
      primaryActionDisabled: false,
      primaryActionLabel: 'Open AIRI manually',
      relayUrl: parsed.relayUrl,
      status: 'fallback',
      title: 'Finish sign-in in AIRI',
    })

    window.setTimeout(() => {
      window.location.replace(parsed.relayUrl)
    }, 180)

    window.setTimeout(() => {
      setViewModel({
        description: 'Automatic handoff did not finish in this browser session.',
        detail: parsed.relayUrl,
        primaryActionDisabled: false,
        primaryActionLabel: 'Open AIRI manually',
        relayUrl: parsed.relayUrl,
        secondaryActionLabel: 'Copy callback link',
        status: 'fallback',
        title: 'Open AIRI to continue',
      })
    }, 960)
  }
}

onMounted(() => {
  void runRelayFlow()
})
</script>

<template>
  <main
    :class="[
      'relative min-h-screen overflow-hidden px-4 py-10 sm:px-6',
      'flex items-center justify-center',
      'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(245,247,255,0.72)_42%,rgba(238,243,255,0.42)_100%)]',
      'dark:bg-[radial-gradient(circle_at_top,rgba(27,31,45,0.96),rgba(12,15,24,0.92)_46%,rgba(5,7,12,1)_100%)]',
    ]"
  >
    <BackgroundGradientOverlay color="color-mix(in srgb, rgb(83 122 255 / 28%) 55%, transparent)" />

    <div
      aria-hidden="true"
      :class="[
        'pointer-events-none absolute left-1/2 top-[16%] size-[22rem] -translate-x-1/2 rounded-full blur-3xl',
        'bg-[radial-gradient(circle,rgba(118,156,255,0.28),transparent_68%)]',
        'dark:bg-[radial-gradient(circle,rgba(118,156,255,0.16),transparent_72%)]',
      ]"
    />

    <div class="relative z-1 max-w-3xl w-full flex flex-col items-center gap-5">
      <AuthNotice
        :description="viewModel.description"
        :detail="viewModel.detail"
        :primary-action-disabled="viewModel.primaryActionDisabled"
        :primary-action-label="viewModel.primaryActionLabel"
        :secondary-action-label="viewModel.secondaryActionLabel"
        :status="viewModel.status"
        :title="viewModel.title"
        @primary-action="openRelayUrl"
        @secondary-action="copyRelayUrl"
      >
        <a
          v-if="viewModel.relayUrl && viewModel.status === 'fallback'"
          :class="[
            'break-all text-center text-xs leading-6 text-neutral-500 underline decoration-dotted underline-offset-4',
            'hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
          ]"
          :href="viewModel.relayUrl"
        >
          {{ viewModel.relayUrl }}
        </a>
      </AuthNotice>
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
