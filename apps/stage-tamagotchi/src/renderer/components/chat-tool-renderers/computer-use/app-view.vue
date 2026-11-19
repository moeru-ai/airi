<script setup lang="ts">
import type { ComputerUseViewOf } from './view'

import { LINE, LINE_ICON, ROW } from './classes'
import { useComputerUseLabels } from './use-labels'

/** An app switch with its check, or the system permissions. */
const props = defineProps<{
  view: ComputerUseViewOf<'activate' | 'permissions'>
}>()

const { t, KEY, label } = useComputerUseLabels()
</script>

<template>
  <template v-if="props.view.kind === 'activate'">
    <span :class="LINE"><span :class="['i-mingcute:switch-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.activated`, { app: props.view.requested }) }}</span>
    <span :class="['inline-flex items-center gap-1 text-xs']">
      <template v-if="props.view.verification === 'verified_foreground'">
        <span :class="['i-mingcute:check-line', 'text-emerald-500']" aria-hidden="true" />
        {{ t(`${KEY}.in-front`) }}
      </template>
      <template v-else-if="props.view.observed">
        <span :class="['i-mingcute:close-line', 'text-red-500']" aria-hidden="true" />
        {{ t(`${KEY}.front-is`, { app: props.view.observed }) }} · {{ props.view.verification }}
      </template>
      <template v-else>
        <span :class="['i-mingcute:question-line', 'text-neutral-400']" aria-hidden="true" />
        {{ t(`${KEY}.front-unknown`) }} · {{ props.view.reason ?? props.view.verification }}
      </template>
    </span>
  </template>

  <template v-else>
    <span :class="LINE"><span :class="['i-mingcute:shield-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.permissions.title`) }}</span>
    <div :class="['flex flex-col gap-1']">
      <div v-for="permission in props.view.permissions" :key="permission.name" :class="ROW">
        <span :class="['min-w-0 flex-1 truncate']">{{ label('permissions.names', permission.name) }}</span>
        <span
          :class="[
            'shrink-0',
            permission.status === 'granted' ? 'i-mingcute:check-circle-fill text-emerald-500'
            : permission.status === 'unknown' ? 'i-mingcute:question-fill text-neutral-400'
              : 'i-mingcute:close-circle-fill text-red-500',
          ]"
          aria-hidden="true"
        />
        <span :class="['shrink-0']">{{ label('permissions.states', permission.status) }}</span>
      </div>
    </div>
  </template>
</template>
