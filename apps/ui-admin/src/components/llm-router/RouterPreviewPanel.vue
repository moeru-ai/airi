<script setup lang="ts">
import type { AdminRouterConfigResult } from '../../modules/api'

import { computed } from 'vue'

const props = defineProps<{
  title: string
  result: AdminRouterConfigResult | null
}>()

const applied = computed(() => props.result?.applied ?? [])
const invalidatedKeys = computed(() => props.result?.invalidatedKeys ?? [])

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
</script>

<template>
  <section :class="['panel', 'overflow-hidden']">
    <div :class="['border-b', 'border-neutral-200', 'px-4', 'py-3', 'text-sm', 'font-semibold']">
      {{ title }}
    </div>

    <div v-if="result" :class="['space-y-4', 'p-4']">
      <div :class="['grid', 'gap-3', 'text-xs', 'sm:grid-cols-2']">
        <div :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50', 'p-3']">
          <div :class="['text-neutral-500']">
            Slices
          </div>
          <div :class="['mt-1', 'text-lg', 'font-semibold']">
            {{ applied.length }}
          </div>
        </div>
        <div :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50', 'p-3']">
          <div :class="['text-neutral-500']">
            Invalidated keys
          </div>
          <div :class="['mt-1', 'text-lg', 'font-semibold']">
            {{ invalidatedKeys.length }}
          </div>
        </div>
      </div>

      <div v-if="applied.length" :class="['space-y-2']">
        <div :class="['text-xs', 'font-semibold', 'uppercase', 'text-neutral-500']">
          Applied
        </div>
        <div :class="['flex', 'flex-wrap', 'gap-2']">
          <span
            v-for="(item, index) in applied"
            :key="index"
            :class="['badge']"
          >
            {{ item.kind }}
            <span v-if="item.modelName" :class="['font-mono']">{{ item.modelName }}</span>
          </span>
        </div>
      </div>

      <div v-if="invalidatedKeys.length" :class="['space-y-2']">
        <div :class="['text-xs', 'font-semibold', 'uppercase', 'text-neutral-500']">
          Keys
        </div>
        <div :class="['flex', 'flex-wrap', 'gap-2']">
          <span v-for="key in invalidatedKeys" :key="key" :class="['badge', 'badge-green', 'font-mono']">
            {{ key }}
          </span>
        </div>
      </div>

      <pre :class="['max-h-[420px]', 'overflow-auto', 'rounded-lg', 'bg-neutral-950', 'p-4', 'text-xs', 'leading-5', 'text-neutral-50']">{{ formatJson(result.preview) }}</pre>
    </div>

    <div v-else :class="['empty-state', 'min-h-40']">
      <span :class="['i-lucide-clipboard-list', 'text-2xl']" />
      No data yet
    </div>
  </section>
</template>
