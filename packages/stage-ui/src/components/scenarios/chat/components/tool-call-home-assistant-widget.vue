<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useHomeAssistantStateLabel } from '../../../../composables/use-home-assistant-state-label'
import { domainOf } from '../../../../libs/home-assistant/client'
import { domainIcon, isEntityActive } from '../../../../libs/home-assistant/presentation'

/** The devices in the result of a Home Assistant call, one row per device, as the settings page shows them. */
const props = defineProps<{
  entities: Array<{ entityId: string, state: string, name?: string }>
  /** A list call sends how many devices it returned and how many match. */
  count?: number
  total?: number
  /** A state call sends every attribute of its one device. */
  attributes?: Record<string, unknown>
}>()

const { t } = useI18n()
const { stateLabel } = useHomeAssistantStateLabel()

const rows = computed(() => props.entities.map((entity) => {
  const domain = domainOf(entity.entityId)
  return {
    entityId: entity.entityId,
    // A device without a friendly name goes by its id, as on the settings page.
    name: entity.name ?? entity.entityId,
    icon: domainIcon(domain),
    active: isEntityActive(domain, entity.state),
    state: stateLabel(domain, entity.state),
  }
}))

const partial = computed(() => props.count !== undefined && props.total !== undefined && props.count < props.total)
</script>

<template>
  <div :class="['flex flex-col gap-2 rounded-xl p-2.5', 'bg-white/75 dark:bg-neutral-800/60']">
    <span v-if="partial" :class="['text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('stage.chat.home-assistant-tool-call.shown', { count: props.count, total: props.total }) }}
    </span>
    <div :class="['flex flex-col gap-1.5']">
      <div
        v-for="row in rows"
        :key="row.entityId"
        :class="['flex items-center gap-2.5 rounded-[10px] px-2.5 py-2', 'bg-white dark:bg-neutral-900/60']"
      >
        <span
          :class="[
            row.icon, 'size-6 shrink-0',
            row.active ? 'text-amber-500 dark:text-amber-400' : 'text-neutral-400 dark:text-neutral-500',
          ]"
          aria-hidden="true"
        />
        <span :class="['min-w-0 flex flex-1 flex-col']">
          <span :class="['truncate text-xs font-medium', 'text-neutral-800 dark:text-neutral-100']">{{ row.name }}</span>
          <span :class="['truncate text-[10px]', 'text-neutral-400 dark:text-neutral-500']">{{ row.entityId }}</span>
        </span>
        <span
          :class="[
            'shrink-0 text-xs',
            row.active ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400',
          ]"
        >{{ row.state }}</span>
      </div>
    </div>
    <div
      v-if="props.attributes"
      :class="[
        'grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-[10px] px-2.5 py-2 text-[11px]',
        'bg-neutral-100 dark:bg-neutral-900/60',
      ]"
    >
      <template v-for="(value, key) in props.attributes" :key="key">
        <span :class="['text-neutral-500 dark:text-neutral-400']">{{ key }}</span>
        <!-- Attribute values are JSON. A string shows as it is, and any other value as its JSON. -->
        <span :class="['min-w-0 break-words', 'text-neutral-800 dark:text-neutral-100']">{{ typeof value === 'string' ? value : JSON.stringify(value) }}</span>
      </template>
    </div>
  </div>
</template>
