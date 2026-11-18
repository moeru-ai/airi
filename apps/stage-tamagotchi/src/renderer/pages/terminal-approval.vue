<script setup lang="ts">
import type { TerminalApprovalView } from '../../shared/eventa/terminal-approval'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Alert, Button } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'
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

onMounted(async () => {
  try {
    const id = typeof route.query.id === 'string' ? route.query.id : undefined
    const pending = await mounted({ id })
    if (pending?.id !== id || pending?.type !== 'terminal-approval')
      throw new Error(tn('unavailable'))
    view.value = v.parse(terminalApprovalViewSchema, pending.payload)
  }
  catch (failure) {
    error.value = errorMessageFrom(failure) ?? tn('unavailable')
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
    error.value = errorMessageFrom(failure) ?? tn('decision-error')
    sending.value = false
  }
}

function formatExpires(expiresAt: number) {
  if (expiresAt >= Number.MAX_SAFE_INTEGER)
    return tn('expires-unlimited')
  return new Date(expiresAt).toLocaleString()
}
</script>

<template>
  <div class="h-100dvh flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <WindowTitleBar />
    <div v-if="view" class="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-10" data-testid="terminal-approval">
      <template v-if="view.kind === 'terminal'">
        <h1 class="text-lg font-semibold">
          {{ tn('approval') }}
        </h1>
        <Alert tone="info" :class="['mt-3']" data-testid="approval-status">
          {{ tn('pending') }}
        </Alert>
        <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {{ tn('scope') }}
        </p>
        <p class="mt-3 text-xs">
          {{ tn('session') }} <span data-testid="approval-session">{{ view.submission.sessionId }}</span>
        </p>
        <pre :class="['mt-2 whitespace-pre-wrap break-words text-sm']" data-testid="approval-request">{{ view.submission.text }}</pre>
        <h2 class="mt-4 text-sm font-semibold">
          {{ tn('command') }}
        </h2>
        <pre :class="['mt-2 whitespace-pre-wrap break-words rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-900']" data-testid="approval-command">{{ view.snapshot.command }}</pre>
        <dl class="grid grid-cols-[auto_1fr] mt-4 gap-x-3 gap-y-2 text-xs">
          <dt>{{ tn('working-directory') }}</dt><dd class="break-all" data-testid="approval-cwd">
            {{ view.snapshot.effectiveCwd }}
          </dd>
          <dt>{{ tn('directory-source') }}</dt><dd>{{ t('settings.pages.modules.mcp-server.terminal.directory-source', { source: view.snapshot.cwdSource }) }}</dd>
          <dt>{{ tn('shell') }}</dt><dd class="break-all" data-testid="approval-shell">
            {{ view.snapshot.shell }}
          </dd>
          <dt>{{ tn('executor') }}</dt><dd>{{ view.serverName }} · {{ view.snapshot.executorPlatform }} · PID {{ view.snapshot.executorPid }}</dd>
          <dt>{{ tn('expires') }}</dt><dd>{{ formatExpires(view.expiresAt) }}</dd>
        </dl>
        <details class="mt-4 text-xs">
          <summary>{{ tn('arguments-identity') }}</summary>
          <pre :class="['mt-2 whitespace-pre-wrap break-words']" data-testid="approval-argv">{{ JSON.stringify(view.snapshot.argv, null, 2) }}</pre>
          <p class="mt-2 break-all">
            {{ t('settings.pages.modules.mcp-server.terminal.turn-call', { turn: view.submission.turnId, call: view.snapshot.toolCallId }) }}
          </p>
          <p class="break-all">
            {{ t('settings.pages.modules.mcp-server.terminal.request-action', { request: view.snapshot.requestId, action: view.actionId }) }}
          </p>
        </details>
      </template>
      <template v-else>
        <h1 class="text-lg font-semibold">
          {{ view.title }}
        </h1>
        <Alert tone="info" :class="['mt-3 whitespace-pre-wrap']" data-testid="approval-status">
          {{ view.detail }}
        </Alert>
        <dl class="grid grid-cols-[auto_1fr] mt-4 gap-x-3 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400">
          <template v-if="view.serverName">
            <dt>{{ tn('server') }}</dt><dd class="break-all">
              {{ view.serverName }}
            </dd>
          </template>
          <template v-if="view.toolName">
            <dt>{{ tn('tool') }}</dt><dd class="break-all">
              {{ view.toolName }}
            </dd>
          </template>
          <dt>{{ tn('session') }}</dt><dd class="break-all">
            {{ view.sessionId }}
          </dd>
          <template v-if="view.turnId">
            <dt>{{ tn('turn') }}</dt><dd class="break-all">
              {{ view.turnId }}
            </dd>
          </template>
          <template v-if="view.toolCallId">
            <dt>{{ tn('call') }}</dt><dd class="break-all">
              {{ view.toolCallId }}
            </dd>
          </template>
          <dt>{{ tn('expires') }}</dt><dd>{{ formatExpires(view.expiresAt) }}</dd>
        </dl>
      </template>
    </div>
    <p v-if="error" class="px-5 py-3 text-sm text-red-600" role="alert">
      {{ error }}
    </p>
    <div class="flex justify-end gap-3 px-5 py-4">
      <Button :disabled="!view || sending" data-testid="approval-reject" @click="respond('cancel')">
        {{ view?.kind === 'confirmation' ? view.cancelLabel : tn('reject') }}
      </Button>
      <Button variant="primary" :disabled="!view || sending" data-testid="approval-confirm" @click="respond('confirm')">
        {{ view?.kind === 'confirmation' ? view.allowLabel : tn('approve') }}
      </Button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
