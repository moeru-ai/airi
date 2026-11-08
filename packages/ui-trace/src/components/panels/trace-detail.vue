<script setup lang="ts">
import type { TraceAttributes, TraceLink } from '@proj-airi/trace-kit'
import type { TimelineSpan, TimelineState, TraceIndexes } from '@proj-airi/trace-kit/projections'
import type { TraceItemRef } from '@proj-airi/trace-kit/views'

import { spanKeyOf } from '@proj-airi/trace-kit'
import { linkTargetKey } from '@proj-airi/trace-kit/projections'
import { childSpans, findItem, spansOfRecords } from '@proj-airi/trace-kit/views'
import { CopyableLabel, IconButton } from '@proj-airi/ui'
import { formatDuration, formatOffset } from '@proj-airi/ui-timeline/headless'
import { useClipboard } from '@vueuse/core'
import { computed, useId } from 'vue'

import SpanLinkCard from './span-link-card.vue'

import { linkRelationLabel, linkTargets } from '../../models/trace-lookup'

const props = defineProps<{
  state: TimelineState
  indexes: TraceIndexes
  version: number
  selection: TraceItemRef
}>()

const emit = defineEmits<{
  select: [selection: TraceItemRef | undefined]
}>()

/** The IDs of the Parent and Children headings, which name their groups. */
const parentHeadingId = useId()
const childrenHeadingId = useId()

const origin = computed(() => Number.isFinite(props.state.start) ? props.state.start : 0)

const selected = computed(() => {
  void props.version
  return findItem(props.state, props.selection)
})

const clipboard = useClipboard({ legacy: true, copiedDuring: 1200 })

/** Copies the selected span, instant, or state change as JSON, for a bug report or a test fixture. */
function copyJson() {
  const { span, instant, change } = selected.value
  const item = span ?? instant ?? change
  if (item)
    void clipboard.copy(JSON.stringify(item, null, 2))
}

function linkLabel(link: TraceLink): string {
  if ('spanId' in link.to)
    return link.to.spanId
  if ('key' in link.to)
    return `${link.to.key} = ${link.to.id}`
  return `${link.to.source}#${link.to.seq}`
}

const outgoing = computed(() => {
  void props.version
  const span = selected.value.span
  const links = span?.links ?? selected.value.instant?.links ?? selected.value.change?.links ?? []
  return links.map(link => ({ link, ...linkTargets(link, props.state, props.indexes) }))
})

const incoming = computed(() => {
  void props.version
  const span = selected.value.span
  if (!span)
    return []
  const keys = [linkTargetKey({ spanId: span.spanId }), ...Object.entries(span.ids ?? {}).map(([key, id]) => linkTargetKey({ key, id }))]
  const seen = new Set<string>()
  const result: { rel: string, span: TimelineSpan }[] = []
  for (const key of keys) {
    for (const record of props.indexes.linksTo.get(key) ?? []) {
      if (!('spanId' in record) || !record.spanId)
        continue
      const source = props.state.spans.get(spanKeyOf(record.source, record.epoch, record.spanId))
      const link = record.links?.find(candidate => linkTargetKey(candidate.to) === key)
      if (source && link && source.key !== span.key && !seen.has(source.key)) {
        seen.add(source.key)
        result.push({ rel: link.rel, span: source })
      }
    }
  }
  return result
})

/** The enclosing span and the direct children of the selected span. A click on either moves one level. */
const nesting = computed(() => {
  void props.version
  const span = selected.value.span
  if (!span)
    return { children: [] }
  return { parent: span.parentKey ? props.state.spans.get(span.parentKey) : undefined, children: childSpans(props.state, span) }
})

/** Spans that share the turn ID of the selection, in start order: the latency breakdown of the turn. */
const turnSpans = computed(() => {
  void props.version
  const turn = selected.value.span?.ids?.turn
  if (turn === undefined)
    return []
  return spansOfRecords(props.state, props.indexes.byId.get(`turn=${turn}`) ?? []).sort((a, b) => a.start - b.start)
})

function entriesOf(attrs: TraceAttributes | undefined): [string, string][] {
  return Object.entries(attrs ?? {}).map(([key, value]) => [key, typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : String(value)])
}
</script>

<template>
  <aside
    aria-label="Details"
    :class="[
      'flex flex-col h-full w-full min-h-0 overflow-y-auto',
      'text-xs select-text',
    ]"
  >
    <div :class="['flex items-center gap-2 px-3 py-2', 'border-b border-neutral-200 dark:border-neutral-800']">
      <div :class="['flex-1 truncate font-semibold text-sm']">
        {{ selected.span?.name ?? selected.instant?.name ?? selected.change?.value ?? 'Not found' }}
      </div>
      <IconButton
        v-if="clipboard.isSupported.value"
        :icon="clipboard.copied.value ? 'i-mingcute:check-line' : 'i-mingcute:braces-line'"
        aria-label="Copy as JSON"
        title="Copy as JSON"
        @click="copyJson"
      />
      <IconButton icon="i-mingcute:close-line" aria-label="Close details" @click="emit('select', undefined)" />
    </div>

    <template v-if="selected.span">
      <dl :class="['grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 px-3 py-2']">
        <dt :class="['text-neutral-500']">
          Track
        </dt>
        <dd :class="['break-all']">
          <CopyableLabel :value="selected.span.track" />
        </dd>
        <dt :class="['text-neutral-500']">
          Source
        </dt>
        <dd :class="['break-all']">
          <CopyableLabel :value="`${selected.span.source}/${selected.span.epoch}`">
            {{ selected.span.source }} · {{ selected.span.epoch.slice(0, 8) }}
          </CopyableLabel>
        </dd>
        <dt :class="['text-neutral-500']">
          Span ID
        </dt>
        <dd>
          <CopyableLabel :value="selected.span.spanId" :class="['font-mono']" />
        </dd>
        <dt :class="['text-neutral-500']">
          Start
        </dt>
        <dd :class="['tabular-nums']">
          {{ formatOffset(selected.span.start - origin) }}
          <span v-if="selected.span.startMissing" :class="['text-amber-600']">start missing</span>
        </dd>
        <dt :class="['text-neutral-500']">
          Duration
        </dt>
        <dd :class="['tabular-nums']">
          <template v-if="selected.span.end !== undefined">
            {{ formatDuration(selected.span.end - selected.span.start) }}
          </template>
          <template v-else>
            {{ selected.span.abandoned ? 'abandoned' : 'running' }}
          </template>
        </dd>
        <template v-if="selected.span.status">
          <dt :class="['text-neutral-500']">
            Status
          </dt>
          <dd :class="[selected.span.status === 'error' ? 'text-red-600 dark:text-red-400' : '']">
            {{ selected.span.status }}<template v-if="selected.span.reason">
              · {{ selected.span.reason }}
            </template>
            <div v-if="selected.span.message" :class="['break-words text-neutral-500']">
              {{ selected.span.message }}
            </div>
          </dd>
        </template>
        <template v-if="selected.span.estimated || selected.span.reordered || selected.span.late">
          <dt :class="['text-neutral-500']">
            Time
          </dt>
          <dd :class="['text-amber-600']">
            {{ [selected.span.estimated ? 'estimated' : '', selected.span.reordered ? 'moved after its cause' : '', selected.span.late ? 'late' : ''].filter(Boolean).join(' · ') }}
          </dd>
        </template>
      </dl>

      <section v-if="nesting.parent || nesting.children.length > 0" :class="['flex flex-col gap-2 px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
        <div v-if="nesting.parent" role="group" :aria-labelledby="parentHeadingId" :class="['flex flex-col gap-1']">
          <h3 :id="parentHeadingId" :class="['font-semibold text-neutral-500']">
            Parent
          </h3>
          <SpanLinkCard
            :span="nesting.parent"
            :track="props.state.tracks.get(nesting.parent.track)"
            @select="emit('select', { kind: 'span', key: nesting.parent!.key })"
          />
        </div>
        <div v-if="nesting.children.length > 0" role="group" :aria-labelledby="childrenHeadingId" :class="['flex items-center gap-2']">
          <h3 :id="childrenHeadingId" :class="['font-semibold text-neutral-500']">
            Children
          </h3>
          <button
            type="button"
            :class="['inline-flex min-w-0 items-center gap-1 text-primary-600 hover:underline dark:text-primary-400']"
            @click="emit('select', { kind: 'span', key: nesting.children[0]!.key })"
          >
            <span :class="['truncate']">{{ nesting.children.length === 1 ? nesting.children[0]!.name : `${nesting.children.length} spans, from ${nesting.children[0]!.name}` }}</span>
            <span :class="['i-mingcute:arrow-down-line size-3.5 shrink-0']" />
          </button>
        </div>
      </section>

      <section v-if="Object.keys(selected.span.ids ?? {}).length > 0" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
        <h3 :class="['mb-1 font-semibold text-neutral-500']">
          IDs
        </h3>
        <div v-for="(value, key) in selected.span.ids" :key="key" :class="['flex gap-2']">
          <span :class="['w-24 shrink-0 text-neutral-500']">{{ key }}</span>
          <CopyableLabel :value="String(value)" :class="['font-mono']" />
        </div>
      </section>

      <section v-if="entriesOf(selected.span.attrs).length > 0" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
        <h3 :class="['mb-1 font-semibold text-neutral-500']">
          Attributes
        </h3>
        <div v-for="[key, value] in entriesOf(selected.span.attrs)" :key="key" :class="['flex gap-2']">
          <span :class="['w-36 shrink-0 break-all text-neutral-500']">{{ key }}</span>
          <CopyableLabel :value="String(value)" :class="['font-mono']" />
        </div>
      </section>

      <section v-if="selected.span.instants.length > 0" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
        <h3 :class="['mb-1 font-semibold text-neutral-500']">
          Instants
        </h3>
        <div v-for="instant in selected.span.instants" :key="instant.key" :class="['flex gap-2']">
          <span :class="['w-20 shrink-0 tabular-nums text-neutral-500']">+{{ formatDuration(instant.time - selected.span.start) }}</span>
          <span :class="['break-all']">{{ instant.name }}</span>
        </div>
      </section>

      <section v-if="selected.span.annotations.length > 0" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
        <h3 :class="['mb-1 font-semibold text-neutral-500']">
          Annotations
        </h3>
        <div v-for="(annotation, index) in selected.span.annotations" :key="index">
          {{ annotation.name }}: {{ annotation.value ?? annotation.label }} <span :class="['text-neutral-500']">({{ annotation.annotator.kind }}{{ annotation.annotator.id ? `: ${annotation.annotator.id}` : '' }})</span>
        </div>
      </section>
    </template>

    <template v-else-if="selected.instant">
      <dl :class="['grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 px-3 py-2']">
        <dt :class="['text-neutral-500']">
          Track
        </dt>
        <dd :class="['break-all']">
          <CopyableLabel :value="selected.instant.track" />
        </dd>
        <dt :class="['text-neutral-500']">
          Time
        </dt>
        <dd :class="['tabular-nums']">
          {{ formatOffset(selected.instant.time - origin) }}
        </dd>
      </dl>
      <section v-if="entriesOf(selected.instant.attrs).length > 0" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
        <div v-for="[key, value] in entriesOf(selected.instant.attrs)" :key="key" :class="['flex gap-2']">
          <span :class="['w-36 shrink-0 break-all text-neutral-500']">{{ key }}</span>
          <CopyableLabel :value="String(value)" :class="['font-mono']" />
        </div>
      </section>
    </template>

    <template v-else-if="selected.change">
      <dl :class="['grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 px-3 py-2']">
        <dt :class="['text-neutral-500']">
          Track
        </dt>
        <dd :class="['break-all']">
          <CopyableLabel :value="selected.change.track" />
        </dd>
        <dt :class="['text-neutral-500']">
          Change
        </dt>
        <dd>{{ selected.change.from ?? '?' }} → {{ selected.change.value }}</dd>
        <template v-if="selected.change.rule">
          <dt :class="['text-neutral-500']">
            Rule
          </dt>
          <dd>{{ selected.change.rule }}</dd>
        </template>
        <dt :class="['text-neutral-500']">
          Time
        </dt>
        <dd :class="['tabular-nums']">
          {{ formatOffset(selected.change.time - origin) }}
        </dd>
      </dl>
    </template>

    <section v-if="outgoing.length > 0" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
      <h3 :class="['mb-1 font-semibold text-neutral-500']">
        Links
      </h3>
      <div v-for="(entry, index) in outgoing" :key="index" :class="['mb-2 flex flex-col gap-1 last:mb-0']">
        <span :class="['text-neutral-500']">{{ linkRelationLabel(entry.link.rel) }}</span>
        <SpanLinkCard
          v-for="target in entry.spans"
          :key="target.key"
          :span="target"
          :track="props.state.tracks.get(target.track)"
          @select="emit('select', { kind: 'span', key: target.key })"
        />
        <button
          v-for="target in entry.items"
          :key="target.key"
          type="button"
          :class="['rounded-lg px-2 py-1.5 text-left', 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800']"
          @click="emit('select', { kind: target.kind, key: target.key })"
        >
          {{ target.label }}
        </button>
        <div
          v-if="entry.spans.length === 0 && entry.items.length === 0"
          :class="['rounded-lg px-2 py-1.5 text-neutral-500', 'border border-dashed border-neutral-300 dark:border-neutral-700']"
        >
          <CopyableLabel :value="linkLabel(entry.link)" :class="['font-mono']" />
          <div>Not in this trace</div>
        </div>
      </div>
    </section>

    <section v-if="incoming.length > 0" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
      <h3 :class="['mb-1 font-semibold text-neutral-500']">
        Linked from
      </h3>
      <div v-for="entry in incoming" :key="entry.span.key" :class="['mb-2 flex flex-col gap-1 last:mb-0']">
        <span :class="['text-neutral-500']">{{ linkRelationLabel(entry.rel) }}</span>
        <SpanLinkCard
          :span="entry.span"
          :track="props.state.tracks.get(entry.span.track)"
          @select="emit('select', { kind: 'span', key: entry.span.key })"
        />
      </div>
    </section>

    <section v-if="turnSpans.length > 1" :class="['px-3 py-2', 'border-t border-neutral-100 dark:border-neutral-900']">
      <h3 :class="['mb-1 font-semibold text-neutral-500']">
        Turn
      </h3>
      <button
        v-for="span in turnSpans"
        :key="span.key"
        :class="[
          'flex w-full gap-2 text-left',
          'hover:bg-neutral-100 dark:hover:bg-neutral-800',
          span.key === selected.span?.key ? 'font-semibold' : '',
        ]"
        @click="emit('select', { kind: 'span', key: span.key })"
      >
        <span :class="['w-16 shrink-0 tabular-nums text-neutral-500']">+{{ formatDuration(span.start - turnSpans[0]!.start) }}</span>
        <span :class="['flex-1 truncate']">{{ span.name }}</span>
        <span :class="['shrink-0 tabular-nums']">{{ span.end !== undefined ? formatDuration(span.end - span.start) : '…' }}</span>
      </button>
    </section>
  </aside>
</template>
