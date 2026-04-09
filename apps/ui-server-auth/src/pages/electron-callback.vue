<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'

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
      'min-h-screen flex items-center justify-center px-6 py-10',
    ]"
  >
    <div
      :class="[
        'max-w-xl w-full rounded-xl border border-neutral-200 bg-white p-6',
        'dark:border-neutral-800 dark:bg-neutral-900',
      ]"
    >
      <div
        :class="[
          'text-2xl font-bold',
        ]"
      >
        {{ viewModel.title }}
      </div>

      <p
        :class="[
          'mt-3 text-sm text-neutral-600 dark:text-neutral-300',
        ]"
      >
        {{ viewModel.description }}
      </p>

      <p
        v-if="viewModel.detail"
        :class="[
          'mt-3 break-all text-xs text-neutral-500 dark:text-neutral-400',
        ]"
      >
        {{ viewModel.detail }}
      </p>

      <div
        :class="[
          'mt-6 flex flex-wrap items-center gap-2',
        ]"
      >
        <button
          v-if="viewModel.primaryActionLabel"
          type="button"
          :disabled="viewModel.primaryActionDisabled"
          :class="[
            'rounded-md border border-neutral-300 px-3 py-2 text-sm',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-neutral-700',
          ]"
          @click="openRelayUrl"
        >
          {{ viewModel.primaryActionLabel }}
        </button>

        <button
          v-if="viewModel.secondaryActionLabel"
          type="button"
          :class="[
            'rounded-md border border-neutral-300 px-3 py-2 text-sm',
            'dark:border-neutral-700',
          ]"
          @click="copyRelayUrl"
        >
          {{ viewModel.secondaryActionLabel }}
        </button>
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
meta:
  layout: plain
</route>
