<script setup lang="ts">
import type { TerminalApprovalView } from '../../shared/eventa/terminal-approval'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Alert, Button } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import * as v from 'valibot'

import WindowTitleBar from '../components/Window/TitleBar.vue'

import { terminalApprovalViewSchema, terminalApprovalWindow } from '../../shared/eventa/terminal-approval'

const route = useRoute()
const { t } = useI18n()
const tn = (key: string) => t(`settings.pages.modules.mcp-server.terminal.${key}`)
const mounted = useElectronEventaInvoke(terminalApprovalWindow.pageMounted)
const decide = useElectronEventaInvoke(terminalApprovalWindow.windowAction)
const view = ref<TerminalApprovalView>()
const error = ref('')
const sending = ref(false)

async function refresh() {
  try {
    const id = typeof route.query.id === 'string' ? route.query.id : undefined
    const pending = await mounted({ id })
    if (pending?.id !== id || pending?.type !== 'terminal-approval')
      throw new Error('This approval request is no longer available.')
    view.value = v.parse(terminalApprovalViewSchema, pending.payload)
  }
  catch (failure) {
    error.value = errorMessageFrom(failure) ?? 'This approval request is unavailable.'
  }
}
onMounted(refresh)
useIntervalFn(() => {
  void refresh()
}, 1000)

const outcome = computed(() => view.value?.outcome)
const backend = computed(() => outcome.value?.result?.structuredContent as { backendResult?: { exitCode?: number, timedOut?: boolean } } | undefined)
const status = computed(() => {
  if (outcome.value?.status === 'unknown')
    return tn('result.unknown')
  if (outcome.value?.status === 'executed')
    return tn('result.executed')
  if (outcome.value)
    return tn(`result.${outcome.value.status}`)
  if (view.value?.dispatched)
    return tn('dispatched')
  if (view.value?.authorized)
    return tn('authorized')
  return tn('pending')
})

async function respond(action: 'confirm' | 'cancel') {
  if (!view.value || sending.value || view.value.authorized || outcome.value)
    return
  sending.value = true
  try {
    await decide({ id: view.value.actionId, action })
  }
  catch (failure) {
    error.value = errorMessageFrom(failure) ?? 'The approval decision could not be sent.'
    sending.value = false
  }
}
</script>

<template>
  <div class="h-100dvh flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <WindowTitleBar />
    <div v-if="view" class="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-10" data-testid="terminal-approval">
      <h1 class="text-lg font-semibold">
        {{ tn('approval') }}
      </h1>
      <Alert :tone="outcome?.status === 'unknown' || outcome?.status === 'failed' ? 'warning' : 'info'" :class="['mt-3']" data-testid="approval-status">
        {{ status }}
        <p v-if="backend?.backendResult">
          Exit: {{ backend.backendResult.exitCode ?? 'unconfirmed' }} · Timeout: {{ backend.backendResult.timedOut ?? 'unconfirmed' }}
        </p>
        <p v-if="outcome?.error" :class="['whitespace-pre-wrap break-words']">
          {{ outcome.error }}
        </p>
      </Alert>
      <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        This command can change files, start applications, and affect the desktop. Approval applies once to this exact operation.
      </p>
      <p class="mt-3 text-xs">
        Session <span data-testid="approval-session">{{ view.submission.sessionId }}</span>
      </p>
      <pre class="mt-2 whitespace-pre-wrap text-sm" data-testid="approval-request">{{ view.submission.text }}</pre>
      <h2 class="mt-4 text-sm font-semibold">
        Command
      </h2>
      <pre class="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-900" data-testid="approval-command">{{ view.snapshot.command }}</pre>
      <dl class="grid grid-cols-[auto_1fr] mt-4 gap-x-3 gap-y-2 text-xs">
        <dt>Working directory</dt><dd class="break-all" data-testid="approval-cwd">
          {{ view.snapshot.effectiveCwd }}
        </dd>
        <dt>Directory source</dt><dd>{{ view.snapshot.cwdSource }} in the Terminal executor</dd>
        <dt>Shell</dt><dd class="break-all" data-testid="approval-shell">
          {{ view.snapshot.shell }}
        </dd>
        <dt>Executor</dt><dd>{{ view.serverName }} · {{ view.snapshot.executorPlatform }} · PID {{ view.snapshot.executorPid }}</dd>
        <dt>Expires</dt><dd>{{ new Date(view.expiresAt).toLocaleString() }}</dd>
      </dl>
      <details class="mt-4 text-xs">
        <summary>Full arguments and request identity</summary>
        <pre class="mt-2 whitespace-pre-wrap" data-testid="approval-argv">{{ JSON.stringify(view.snapshot.argv, null, 2) }}</pre>
        <p class="mt-2 break-all">
          Turn {{ view.submission.turnId }} · Call {{ view.snapshot.toolCallId }}
        </p>
        <p class="break-all">
          Request {{ view.snapshot.requestId }} · Action {{ view.actionId }}
        </p>
      </details>
    </div>
    <p v-if="error" class="px-5 py-3 text-sm text-red-600" role="alert">
      {{ error }}
    </p>
    <div v-if="!view?.authorized && !outcome" class="flex justify-end gap-3 px-5 py-4">
      <Button :disabled="!view || sending" data-testid="approval-reject" @click="respond('cancel')">
        {{ tn('reject') }}
      </Button>
      <Button variant="primary" :disabled="!view || sending" data-testid="approval-confirm" @click="respond('confirm')">
        {{ tn('approve') }}
      </Button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
