<script setup lang="ts">
import type { ContextBucketSnapshot } from '@proj-airi/stage-ui/stores/chat/context-store'

import { Section } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'

const props = defineProps<{
  buckets: ContextBucketSnapshot[]
  filterText: string
  now: number
}>()

const filteredBuckets = computed(() => {
  const query = props.filterText.trim().toLowerCase()
  if (!query)
    return props.buckets

  return props.buckets.filter((bucket) => {
    const haystack = [
      bucket.sourceKey,
      ...bucket.messages.map(message => [
        message.text,
        message.contextId,
        message.id,
        message.lane,
        message.strategy,
      ].filter(Boolean).join(' ')),
    ].join(' ').toLowerCase()

    return haystack.includes(query)
  })
})

function formatAge(timestamp?: number) {
  if (!timestamp)
    return 'n/a'

  const ageMs = Math.max(0, props.now - timestamp)
  if (ageMs < 1000)
    return 'now'
  if (ageMs < 60_000)
    return `${Math.floor(ageMs / 1000)}s ago`
  return `${Math.floor(ageMs / 60_000)}m ago`
}

function isAged(timestamp?: number) {
  if (!timestamp)
    return false
  return props.now - timestamp >= 60_000
}
</script>

<template>
  <Section
    title="Active Context State"
    icon="i-solar:database-bold-duotone"
    inner-class="gap-3"
    :expand="true"
  >
    <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      {{ filteredBuckets.length }} source bucket(s) currently retained in `chat-context`.
    </div>

    <div v-if="!filteredBuckets.length" :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
      No retained contexts match the current filter.
    </div>

    <div v-else :class="['grid', 'gap-3']">
      <div
        v-for="bucket in filteredBuckets"
        :key="bucket.sourceKey"
        :class="[
          'rounded-xl',
          'border',
          'border-neutral-200/70',
          'bg-white/80',
          'p-4',
          'dark:border-neutral-800/80',
          'dark:bg-neutral-950/60',
        ]"
      >
        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
          <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
            <span :class="['rounded-full', 'border', 'border-neutral-300/70', 'bg-neutral-100/80', 'px-2', 'py-0.5', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:border-neutral-700', 'dark:bg-neutral-900/80', 'dark:text-neutral-200']">
              {{ bucket.sourceKey }}
            </span>
            <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ bucket.entryCount }} entr{{ bucket.entryCount === 1 ? 'y' : 'ies' }}
            </span>
          </div>
          <span
            :class="[
              'text-xs',
              isAged(bucket.latestCreatedAt)
                ? 'text-orange-600 dark:text-orange-300'
                : 'text-neutral-500 dark:text-neutral-400',
            ]"
          >
            Latest {{ formatAge(bucket.latestCreatedAt) }}
          </span>
        </div>

        <div :class="['mt-3', 'grid', 'gap-2']">
          <div
            v-for="message in bucket.messages"
            :key="message.id"
            :class="[
              'rounded-lg',
              'bg-neutral-50/90',
              'p-3',
              'dark:bg-neutral-900/70',
            ]"
          >
            <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2', 'text-[11px]', 'uppercase', 'tracking-[0.06em]', 'text-neutral-400', 'dark:text-neutral-500']">
              <span>{{ message.strategy }}</span>
              <span v-if="message.lane">{{ message.lane }}</span>
              <span>{{ message.contextId }}</span>
            </div>
            <pre :class="['mt-2', 'whitespace-pre-wrap', 'break-words', 'text-xs', 'font-mono', 'text-neutral-800', 'dark:text-neutral-100']">{{ message.text }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Section>
</template>
