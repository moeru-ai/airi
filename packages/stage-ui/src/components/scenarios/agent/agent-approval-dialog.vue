<script setup lang="ts">
import { BottomDrawer, Button, Callout } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AgentRiskBadge from './agent-risk-badge.vue'

import { useAgentPermissionStore } from '../../../stores/agent-permissions'

const { t } = useI18n()
const permissions = useAgentPermissionStore()

/**
 * One drawer serves every waiting call. The store queues the calls, so the
 * dialog shows the first one and swaps to the next after each answer.
 */
const open = ref(false)
const detailsOpen = ref(false)
const remember = ref(false)

const request = computed(() => permissions.activeRequest)

watch(request, (next) => {
  detailsOpen.value = false
  remember.value = false
  open.value = next !== undefined
})

/** A drawer that closes without an answer denies the call, so the model can continue. */
watch(open, (isOpen) => {
  if (!isOpen && request.value !== undefined)
    permissions.resolveActive(false)
})

function approve() {
  permissions.resolveActive(true, remember.value)
}

function deny() {
  permissions.resolveActive(false)
}

const argumentsJson = computed(() => {
  const args = request.value?.args
  if (args === undefined)
    return ''
  try {
    return JSON.stringify(args, null, 2)
  }
  catch {
    return String(args)
  }
})
</script>

<template>
  <BottomDrawer
    v-model="open"
    :title="t('stage.agent-permission.request.title')"
  >
    <div v-if="request" :class="['flex flex-col gap-4 pb-2']">
      <Callout theme="orange" :label="t('stage.agent-permission.request.heading')">
        <div :class="['flex flex-wrap items-center gap-2']">
          <AgentRiskBadge :level="request.riskLevel" />
          <span :class="['font-medium break-all']">{{ request.displayName }}</span>
        </div>
      </Callout>

      <p :class="['text-sm text-neutral-600 break-all dark:text-neutral-300']">
        {{ request.preview }}
      </p>

      <div>
        <button
          type="button"
          :aria-expanded="detailsOpen"
          :class="[
            'rounded-lg px-2 py-1 text-xs outline-none transition-colors',
            'text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200',
            'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
          ]"
          @click="detailsOpen = !detailsOpen"
        >
          {{ t('stage.agent-permission.request.details') }}
        </button>
        <pre
          v-if="detailsOpen"
          :class="[
            'mt-2 max-h-52 overflow-auto rounded-lg bg-neutral-100 p-3 text-xs whitespace-pre-wrap break-all',
            'text-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200',
          ]"
        >{{ argumentsJson }}</pre>
      </div>

      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('stage.agent-permission.request.deny-note') }}
      </p>

      <label :class="['flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300']">
        <input v-model="remember" type="checkbox" :class="['size-4 accent-primary-500']">
        {{ t('stage.agent-permission.request.approve-always') }}
      </label>

      <div :class="['flex flex-wrap items-center gap-2']">
        <Button color="primary" variant="primary" @click="approve">
          {{ t('stage.agent-permission.request.approve') }}
        </Button>
        <Button color="red" variant="secondary" @click="deny">
          {{ t('stage.agent-permission.request.deny') }}
        </Button>
      </div>
    </div>
  </BottomDrawer>
</template>
