<script setup lang="ts">
import type { ContextProjectionGroupKind } from '@proj-airi/stage-ui/stores/devtools/context-observability'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { groupProjectionSections, reportedWindowUsage, useContextPromptProjectionStore } from '@proj-airi/stage-ui/stores/devtools/context-observability'
import { DropdownMenu, GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { lastPromptProjection } = storeToRefs(useContextPromptProjectionStore())
const { activeSessionId } = storeToRefs(useChatSessionStore())
const expandedKind = shallowRef<ContextProjectionGroupKind>()
const expandedSectionId = shallowRef<string>()

const kindTone: Record<ContextProjectionGroupKind, string> = {
  'system-context': 'bg-neutral-400',
  'conversation': 'bg-primary-500',
  'tool-call': 'bg-amber-500',
  'tool-result': 'bg-emerald-500',
  'tool-schema': 'bg-sky-500',
  'framing': 'bg-neutral-500',
}

const projection = computed(() => {
  const current = lastPromptProjection.value
  if (!current?.providerCaptured || current.sessionId !== activeSessionId.value)
    return undefined
  return current
})

const breakdown = computed(() => projection.value?.breakdown)

const groups = computed(() => breakdown.value ? groupProjectionSections(breakdown.value) : [])

const windowUsage = computed(() => reportedWindowUsage(
  projection.value?.request?.contextWindowTokens,
  projection.value?.reportedUsage?.inputTokens,
))

/** Width of the filled composition track. Uses reported window fill when it exists. */
const compositionFill = computed(() => windowUsage.value?.bar ?? 100)

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return '0 B'
  if (bytes < 1024)
    return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

const tokenFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

function formatShare(bytes: number, total: number) {
  if (total <= 0)
    return '0%'
  return `${((bytes / total) * 100).toFixed(1)}%`
}

function kindLabel(kind: ContextProjectionGroupKind) {
  if (kind === 'framing')
    return t('tamagotchi.stage.chat-window.context-inspector.framing')
  return t(`tamagotchi.stage.chat-window.context-inspector.kind.${kind}`)
}

function segmentWidth(bytes: number) {
  const total = breakdown.value?.totalBytes ?? 0
  if (total <= 0)
    return '0%'
  return `${(bytes / total) * 100}%`
}

function toggleKind(kind: ContextProjectionGroupKind) {
  if (expandedKind.value === kind) {
    expandedKind.value = undefined
    expandedSectionId.value = undefined
    return
  }
  expandedKind.value = kind
  expandedSectionId.value = undefined
}

function toggleSection(id: string) {
  expandedSectionId.value = expandedSectionId.value === id ? undefined : id
}
</script>

<template>
  <DropdownMenu side="top" align="start" :modal="false" :content-class="['w-80 p-0!']">
    <template #trigger>
      <GhostButton
        size="unset"
        data-testid="context-inspector-toggle"
        :class="['h-9 gap-1 px-1.5']"
        :aria-label="t('tamagotchi.stage.chat-window.context-inspector.open')"
        :title="t('tamagotchi.stage.chat-window.context-inspector.open')"
      >
        <span
          v-if="windowUsage"
          aria-hidden="true"
          :class="[
            'context-ring size-4 shrink-0',
            windowUsage.over ? 'text-amber-600 dark:text-amber-400' : 'text-primary-500',
          ]"
          :style="{ '--context-fill': `${windowUsage.bar}%` }"
        />
        <span v-else :class="['i-solar:pie-chart-2-bold-duotone size-5 shrink-0']" />
        <span
          v-if="windowUsage"
          :class="[
            'text-xs tabular-nums',
            windowUsage.over ? 'text-amber-600 dark:text-amber-400' : '',
          ]"
        >{{ windowUsage.label }}%</span>
      </GhostButton>
    </template>

    <div data-testid="context-inspector" :class="['flex max-h-96 flex-col']">
      <div :class="['flex flex-col gap-2 px-3 pt-2.5 pb-2']">
        <div :class="['flex items-center justify-between gap-2']">
          <p :class="['truncate text-sm font-medium']">
            {{ t('tamagotchi.stage.chat-window.context-inspector.title') }}
          </p>
          <p
            v-if="projection?.request?.model"
            data-testid="context-model"
            :class="['max-w-[55%] truncate text-xs text-neutral-500 dark:text-neutral-400']"
          >
            {{ projection.request.model }}
            <span v-if="projection.request.providerId" data-testid="context-provider">· {{ projection.request.providerId }}</span>
          </p>
        </div>

        <p v-if="!projection" data-testid="context-inspector-empty" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.stage.chat-window.context-inspector.empty') }}
        </p>

        <template v-else>
          <div :class="['flex items-end justify-between gap-2']">
            <p
              v-if="windowUsage"
              data-testid="context-window-usage"
              :data-percent="windowUsage.label"
              :data-over="windowUsage.over ? 'true' : undefined"
              :class="[
                'text-sm font-medium tabular-nums',
                windowUsage.over ? 'text-amber-600 dark:text-amber-400' : '',
              ]"
            >
              {{ t(
                windowUsage.over
                  ? 'tamagotchi.stage.chat-window.context-inspector.window-over'
                  : 'tamagotchi.stage.chat-window.context-inspector.window-full',
                { percent: windowUsage.label },
              ) }}
            </p>
            <p
              v-else
              data-testid="context-usage-unavailable"
              :class="['text-xs text-neutral-500 dark:text-neutral-400']"
            >
              {{ t('tamagotchi.stage.chat-window.context-inspector.usage-unavailable') }}
            </p>
            <p
              v-if="projection.request?.contextWindowTokens && projection.reportedUsage?.inputTokens != null"
              data-testid="context-window"
              :class="['text-xs tabular-nums text-neutral-500 dark:text-neutral-400']"
            >
              <span data-testid="context-reported-input">{{ tokenFormat.format(projection.reportedUsage.inputTokens) }}</span>
              /
              {{ tokenFormat.format(projection.request.contextWindowTokens) }}
              {{ t('tamagotchi.stage.chat-window.context-inspector.tokens') }}
            </p>
            <p
              v-else
              data-testid="context-serialized-bytes"
              :class="['text-xs tabular-nums text-neutral-500 dark:text-neutral-400']"
            >
              {{ formatBytes(breakdown?.totalBytes ?? 0) }}
            </p>
          </div>

          <div
            v-if="groups.length > 0"
            data-testid="context-composition-bar"
            :class="['h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700']"
          >
            <div
              :class="['flex h-full overflow-hidden']"
              :style="{ width: `${compositionFill}%` }"
            >
              <span
                v-for="group in groups"
                :key="group.kind"
                :class="[kindTone[group.kind], 'h-full shrink-0']"
                :style="{ width: segmentWidth(group.totalBytes) }"
                :title="`${kindLabel(group.kind)} ${formatShare(group.totalBytes, breakdown?.totalBytes ?? 0)}`"
              />
            </div>
          </div>

          <p data-testid="context-bytes-note" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('tamagotchi.stage.chat-window.context-inspector.bytes-note') }}
            <span v-if="breakdown" data-testid="context-reported-usage" :class="['tabular-nums']">
              · {{ formatBytes(breakdown.totalBytes) }}
            </span>
          </p>
        </template>
      </div>

      <ol
        v-if="groups.length > 0"
        data-testid="context-sections"
        :class="['flex min-h-0 flex-col overflow-y-auto px-1 pb-1']"
      >
        <li
          v-for="group in groups"
          :key="group.kind"
          :data-kind="group.kind"
          :data-title="kindLabel(group.kind)"
        >
          <button
            type="button"
            data-testid="context-group-expand"
            :aria-expanded="expandedKind === group.kind"
            :class="[
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
              'hover:bg-neutral-100 dark:hover:bg-neutral-700/70',
              'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
            ]"
            @click="toggleKind(group.kind)"
          >
            <span :class="[kindTone[group.kind], 'size-2.5 shrink-0 rounded-sm']" />
            <span :class="['min-w-0 flex-1 truncate text-sm']">{{ kindLabel(group.kind) }}</span>
            <span data-testid="context-section-share" :class="['shrink-0 text-xs tabular-nums text-neutral-500']">
              {{ formatBytes(group.totalBytes) }}
            </span>
          </button>

          <ol
            v-if="expandedKind === group.kind && group.sections.length > 0"
            :class="['mb-1 ml-3 flex flex-col pl-1']"
          >
            <li
              v-for="section in group.sections"
              :key="section.id"
              :data-kind="section.kind"
              :data-title="section.title"
            >
              <button
                type="button"
                data-testid="context-section-expand"
                :aria-expanded="expandedSectionId === section.id"
                :class="[
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left',
                  'hover:bg-neutral-100 dark:hover:bg-neutral-700/70',
                  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                ]"
                @click="toggleSection(section.id)"
              >
                <span :class="['min-w-0 flex-1 truncate text-xs text-neutral-600 dark:text-neutral-300']">
                  {{ section.title }}
                </span>
                <span :class="['shrink-0 text-xs tabular-nums text-neutral-500']">
                  {{ formatBytes(section.totalBytes) }}
                </span>
              </button>
              <div
                v-if="expandedSectionId === section.id"
                :class="['mb-1 flex flex-col gap-1 px-2']"
              >
                <div :class="['grid grid-cols-2 gap-2 text-xs tabular-nums text-neutral-500']">
                  <p data-testid="context-section-text">
                    {{ t('tamagotchi.stage.chat-window.context-inspector.text') }}
                    {{ formatBytes(section.textBytes) }}
                  </p>
                  <p data-testid="context-section-image">
                    {{ t('tamagotchi.stage.chat-window.context-inspector.images') }}
                    {{ formatBytes(section.imageBytes) }}
                  </p>
                </div>
                <pre
                  data-testid="context-section-preview"
                  data-expanded="true"
                  :class="['max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-xs text-neutral-600 dark:text-neutral-300']"
                >{{ section.preview }}</pre>
              </div>
            </li>
          </ol>
          <p
            v-else-if="expandedKind === group.kind && group.kind === 'framing'"
            data-testid="context-framing-share"
            :class="['px-2 pb-1 text-xs text-neutral-500']"
          >
            {{ formatShare(group.totalBytes, breakdown?.totalBytes ?? 0) }}
          </p>
        </li>
      </ol>
    </div>
  </DropdownMenu>
</template>

<style scoped>
.context-ring {
  background: conic-gradient(currentColor var(--context-fill), color-mix(in srgb, currentColor 28%, transparent) 0);
  -webkit-mask: radial-gradient(farthest-side, transparent 62%, #000 63%);
  mask: radial-gradient(farthest-side, transparent 62%, #000 63%);
}
</style>
