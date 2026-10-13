<script setup lang="ts">
import { BottomDrawer, Button, Callout, Checkbox } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AgentRiskBadge from './agent-risk-badge.vue'

import { useAgentPermissionStore } from '../../../stores/agent-permissions'

const { t } = useI18n()
const permissions = useAgentPermissionStore()

/** The host owns this model, so one button in any layout opens the same panel. */
const open = defineModel<boolean>({ default: false })
const fullAccessConfirmOpen = ref(false)

const modeSummary = computed(() => {
  if (permissions.fullAccess)
    return t('stage.agent-permission.mode-summary.full')
  if (permissions.autoApproveMedium)
    return t('stage.agent-permission.mode-summary.medium')
  return t('stage.agent-permission.mode-summary.guarded')
})

/**
 * Full access opens a confirmation first. The toggle turns on only after the
 * user reads what it permits, and the label states the effect of each state.
 */
function changeFullAccess(next: boolean) {
  if (next) {
    fullAccessConfirmOpen.value = true
    return
  }
  permissions.setFullAccess(false)
}

function confirmFullAccess() {
  permissions.setFullAccess(true)
  fullAccessConfirmOpen.value = false
}

const recent = computed(() => permissions.history.slice(0, 5))
</script>

<template>
  <BottomDrawer
    v-model="open"
    :title="t('stage.agent-permission.title')"
  >
    <div :class="['flex flex-col gap-5 pb-2']">
      <div :class="['flex items-start justify-between gap-4']">
        <div :class="['flex flex-col gap-1']">
          <span :class="['text-sm font-medium']">{{ t('stage.agent-permission.enabled.label') }}</span>
          <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('stage.agent-permission.enabled.description') }}
          </span>
        </div>
        <Checkbox
          :model-value="permissions.agentEnabled"
          @update:model-value="permissions.setAgentEnabled"
        />
      </div>

      <Callout :label="modeSummary">
        {{ t('stage.agent-permission.button-description') }}
      </Callout>

      <!--
        The settings below only take effect while the agent is on, so the group
        dims and stops receiving input when the master switch is off.
      -->
      <div
        :class="[
          'flex flex-col gap-5 transition-opacity duration-200 motion-reduce:transition-none',
          permissions.agentEnabled ? '' : 'pointer-events-none opacity-50',
        ]"
      >
        <div :class="['flex items-start justify-between gap-4']">
          <div :class="['flex flex-col gap-1']">
            <span :class="['text-sm font-medium']">{{ t('stage.agent-permission.full-access.label') }}</span>
            <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ t('stage.agent-permission.full-access.description') }}
            </span>
          </div>
          <Checkbox
            :model-value="permissions.fullAccess"
            :disabled="!permissions.agentEnabled"
            @update:model-value="changeFullAccess"
          />
        </div>

        <div :class="['flex items-start justify-between gap-4']">
          <div :class="['flex flex-col gap-1']">
            <span :class="['text-sm font-medium']">{{ t('stage.agent-permission.auto-approve-medium.label') }}</span>
            <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ t('stage.agent-permission.auto-approve-medium.description') }}
            </span>
          </div>
          <Checkbox
            :model-value="permissions.autoApproveMedium"
            :disabled="!permissions.agentEnabled || permissions.fullAccess"
            @update:model-value="permissions.setAutoApproveMedium"
          />
        </div>
      </div>

      <div :class="['flex flex-col gap-2']">
        <span :class="['text-sm font-medium']">{{ t('stage.agent-permission.recent.title') }}</span>
        <p v-if="recent.length === 0" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('stage.agent-permission.recent.empty') }}
        </p>
        <ul v-else :class="['flex flex-col gap-2']">
          <li
            v-for="entry in recent"
            :key="entry.id"
            :class="['flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300']"
          >
            <AgentRiskBadge :level="entry.riskLevel" />
            <span :class="['break-all']">{{ entry.displayName }}</span>
          </li>
        </ul>
      </div>
    </div>
  </BottomDrawer>

  <BottomDrawer
    v-model="fullAccessConfirmOpen"
    :title="t('stage.agent-permission.full-access-confirm.title')"
  >
    <div :class="['flex flex-col gap-4 pb-2']">
      <Callout theme="orange" :label="t('stage.agent-permission.full-access-confirm.heading')">
        {{ t('stage.agent-permission.full-access-confirm.body') }}
      </Callout>
      <div :class="['flex flex-wrap items-center gap-2']">
        <Button color="red" variant="primary" @click="confirmFullAccess">
          {{ t('stage.agent-permission.full-access-confirm.confirm') }}
        </Button>
        <Button @click="fullAccessConfirmOpen = false">
          {{ t('stage.agent-permission.full-access-confirm.cancel') }}
        </Button>
      </div>
    </div>
  </BottomDrawer>
</template>
