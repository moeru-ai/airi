<script setup lang="ts">
import { computed } from 'vue'

import { ADMIN_API_ENVIRONMENTS, apiEnvironmentValueFor, buildApiServerSwitchUrl } from '../../modules/server-admin-context'

const props = defineProps<{
  apiServerUrl: string
}>()

const selectedEnvironment = computed(() => apiEnvironmentValueFor(props.apiServerUrl))

function switchEnvironment(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement))
    return

  if (target.value === selectedEnvironment.value)
    return

  window.location.assign(buildApiServerSwitchUrl(window.location.href, target.value))
}
</script>

<template>
  <label :class="['flex', 'items-center', 'gap-2', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
    <span :class="['i-lucide-server', 'h-4', 'w-4', 'shrink-0']" />
    <span :class="['sr-only']">API environment</span>
    <select
      :class="[
        'h-8',
        'max-w-[180px]',
        'rounded-md',
        'border',
        'border-neutral-200',
        'bg-white',
        'px-2',
        'text-xs',
        'font-medium',
        'text-neutral-700',
        'outline-none',
        'dark:border-neutral-800',
        'dark:bg-neutral-950',
        'dark:text-neutral-200',
        'focus:border-emerald-500',
        'focus:ring-3',
        'focus:ring-emerald-500/14',
      ]"
      :value="selectedEnvironment"
      @change="switchEnvironment"
    >
      <option
        v-for="environment in ADMIN_API_ENVIRONMENTS"
        :key="environment.value"
        :value="environment.value"
      >
        {{ environment.label }} - {{ environment.description }}
      </option>
    </select>
  </label>
</template>
