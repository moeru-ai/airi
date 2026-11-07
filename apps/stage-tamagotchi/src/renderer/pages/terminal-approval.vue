<script setup lang="ts">
import type { TerminalApprovalView } from '../../shared/eventa/terminal-approval'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Button } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import * as v from 'valibot'

import WindowTitleBar from '../components/Window/TitleBar.vue'

import { terminalApprovalViewSchema, terminalApprovalWindow } from '../../shared/eventa/terminal-approval'

const route = useRoute()
const mounted = useElectronEventaInvoke(terminalApprovalWindow.pageMounted)
const decide = useElectronEventaInvoke(terminalApprovalWindow.windowAction)
const view = ref<TerminalApprovalView>()
const error = ref('')
const sending = ref(false)

onMounted(async () => {
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
})

async function respond(action: 'confirm' | 'cancel') {
  if (!view.value || sending.value)
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
        Approve a Terminal command
      </h1>
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
    <div class="flex justify-end gap-3 px-5 py-4">
      <Button :disabled="!view || sending" data-testid="approval-reject" @click="respond('cancel')">
        Reject
      </Button>
      <Button variant="primary" :disabled="!view || sending" data-testid="approval-confirm" @click="respond('confirm')">
        Approve once
      </Button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
