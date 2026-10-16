<script setup lang="ts">
import type { ComputerUsePoint, ComputerUseRect, ComputerUseSize, ComputerUseView } from './computer-use-tool-call-view'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ComputerUseDelivery from './computer-use-delivery.vue'
import ComputerUseKeycaps from './computer-use-keycaps.vue'
import ComputerUseMediaState from './computer-use-media-state.vue'
import ComputerUseTextMatches from './computer-use-text-matches.vue'
import ToolCallScreenshot from './tool-call-screenshot.vue'

import { useComputerUseScreenshots } from './use-computer-use-screenshots'

/**
 * One AUV command: its name and status, and a card for what it did.
 * A failed command shows why it failed. A command without a card shows only the header.
 */
const props = defineProps<{
  command: string
  status: string
  failure?: { message: string, code?: string }
  view?: ComputerUseView
}>()

const { t, te, locale } = useI18n()
const KEY = 'tamagotchi.stage.computer-use-tool-call'

// AUV can add states, paths, and other names. A name without words here shows as AUV writes it.
function label(path: string, value: string) {
  return te(`${KEY}.${path}.${value}`) ? t(`${KEY}.${path}.${value}`) : value
}

const pointText = (point: ComputerUsePoint) => `(${Math.round(point.x)}, ${Math.round(point.y)})`
const sizeText = (size: ComputerUseSize) => `${Math.round(size.width)} × ${Math.round(size.height)}`
const rectText = (rect: ComputerUseRect) => `${pointText(rect.origin)} · ${sizeText(rect.size)}`

const fileSize = computed(() => new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }))

/** The screenshot of each capture artifact. A file that cannot be read shows no image. */
const images = useComputerUseScreenshots(() => props.view?.kind === 'capture' ? props.view.files.map(file => file.path) : undefined)

const captureFacts = computed(() => {
  const view = props.view
  if (view?.kind !== 'capture')
    return []
  const display = view.display
  const window = view.window
  return [
    ...(display
      ? [{ label: t(`${KEY}.display`), value: [display.name, display.is_builtin && t(`${KEY}.built-in`), display.is_primary && t(`${KEY}.primary`)].filter(Boolean).join(' · ') }]
      : []),
    ...(window ? [{ label: t(`${KEY}.window`), value: `${window.title} · ${window.app_name}` }] : []),
    { label: t(`${KEY}.region`), value: rectText(view.capture.bounds) },
    { label: t(`${KEY}.logical-size`), value: `${sizeText(view.capture.bounds.size)} · ${view.capture.scale}x` },
    { label: t(`${KEY}.pixel-size`), value: sizeText(view.capture.pixelSize) },
    { label: t(`${KEY}.backend`), value: view.capture.backend },
    ...(view.capture.fallbackReason ? [{ label: t(`${KEY}.fallback`), value: view.capture.fallbackReason }] : []),
    ...view.files.map(file => ({ label: t(`${KEY}.file`), value: `${file.extension.toUpperCase()} · ${fileSize.value.format(file.bytes / 1_000_000)}` })),
  ]
})

const CARD = ['flex flex-col gap-2 rounded-xl p-2.5', 'bg-white/75 dark:bg-neutral-800/60']
const ROW = ['flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', 'bg-white dark:bg-neutral-900/60']
const LINE = ['flex flex-wrap items-center gap-2 text-[13px]', 'text-neutral-800 dark:text-neutral-100']
const LINE_ICON = ['shrink-0 text-lg', 'text-primary-500 dark:text-primary-300']
const FACTS = ['grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px]']
const FACT_LABEL = ['text-neutral-500 dark:text-neutral-400']
const FACT_VALUE = ['min-w-0 break-words', 'text-neutral-800 dark:text-neutral-100']
const CHIP = ['inline-flex items-center rounded-full px-1.5 py-px text-[11px]', 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300']
const QUOTE = ['whitespace-pre-wrap break-words rounded-[10px] border-l-3 px-2.5 py-2 text-xs', 'border-primary-300 bg-white text-neutral-800 dark:border-primary-700 dark:bg-neutral-900/60 dark:text-neutral-100']
</script>

<template>
  <div :class="CARD">
    <div :class="['flex items-center justify-between gap-2']">
      <span :class="['min-w-0 inline-flex items-center gap-1.5 text-xs font-semibold', 'text-neutral-800 dark:text-neutral-100']">
        <span :class="['i-mingcute:terminal-box-line', 'shrink-0']" aria-hidden="true" />
        <code :class="['truncate']">{{ props.command }}</code>
      </span>
      <span :class="['shrink-0 inline-flex items-center gap-1 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
        <span
          :class="[
            'size-1.5 rounded-full',
            props.status === 'completed' ? 'bg-emerald-500' : props.status === 'failed' ? 'bg-red-500' : 'bg-neutral-400',
          ]"
          aria-hidden="true"
        />
        {{ label('status', props.status) }}
      </span>
    </div>

    <div
      v-if="props.failure"
      :class="['flex flex-col gap-1 rounded-[10px] px-2.5 py-2 text-xs', 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300']"
    >
      <span :class="['break-words']">{{ props.failure.message }}</span>
      <code v-if="props.failure.code" :class="['text-[10px] opacity-70']">{{ props.failure.code }}</code>
    </div>

    <template v-if="props.view?.kind === 'capture'">
      <template v-for="file in props.view.files" :key="file.path">
        <ToolCallScreenshot v-if="images.has(file.path)" :url="images.get(file.path)!" :title="file.path.split(/[\\/]/).at(-1) ?? ''" />
      </template>
      <div :class="FACTS">
        <template v-for="(fact, index) in captureFacts" :key="index">
          <span :class="FACT_LABEL">{{ fact.label }}</span>
          <span :class="FACT_VALUE">{{ fact.value }}</span>
        </template>
      </div>
    </template>

    <template v-else-if="props.view?.kind === 'displays'">
      <span :class="LINE"><span :class="['i-mingcute:monitor-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.displays`, { count: props.view.displays.length }, props.view.displays.length) }}</span>
      <div :class="['flex flex-col gap-1']">
        <div v-for="display in props.view.displays" :key="display.id" :class="ROW">
          <span :class="[display.is_builtin ? 'i-mingcute:laptop-line' : 'i-mingcute:monitor-line', 'shrink-0 text-neutral-500']" aria-hidden="true" />
          <span :class="['min-w-0 flex flex-1 flex-col']">
            <span :class="['truncate']">{{ display.name }}</span>
            <span :class="['text-[10px] tabular-nums text-neutral-400']">#{{ display.id }} · {{ rectText(display.frame) }} · {{ display.scale_factor }}x</span>
          </span>
          <span v-if="display.is_builtin" :class="CHIP">{{ t(`${KEY}.built-in`) }}</span>
          <span v-if="display.is_primary" :class="CHIP">{{ t(`${KEY}.primary`) }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="props.view?.kind === 'windows'">
      <span :class="LINE"><span :class="['i-mingcute:layout-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.windows`, { count: props.view.windows.length }, props.view.windows.length) }}</span>
      <div :class="['flex flex-col gap-1']">
        <div v-for="window in props.view.windows" :key="window.id" :class="ROW">
          <span :class="['min-w-0 flex flex-1 flex-col']">
            <span :class="['truncate']">{{ window.title || window.app_name }}</span>
            <span :class="['truncate text-[10px] tabular-nums text-neutral-400']">
              {{ window.app_name }}<template v-if="window.app_bundle_id"> · {{ window.app_bundle_id }}</template> · pid {{ window.process_id }} · #{{ window.id }} · {{ rectText(window.frame) }}
            </span>
          </span>
          <span v-if="window.is_main" :class="CHIP">{{ t(`${KEY}.main`) }}</span>
          <span v-if="!window.is_visible" :class="CHIP">{{ t(`${KEY}.hidden`) }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="props.view?.kind === 'matches'">
      <span :class="LINE">
        <span :class="['i-mingcute:search-3-fill', LINE_ICON]" aria-hidden="true" />
        {{ props.view.matches.length > 0
          ? `${t(`${KEY}.found`, { query: props.view.query })} · ${t(`${KEY}.matches`, { count: props.view.matches.length }, props.view.matches.length)}`
          : t(`${KEY}.not-found`, { query: props.view.query }) }}
      </span>
      <span v-if="props.view.window" :class="['text-[11px] text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.window`) }} · {{ props.view.window.title }} · {{ props.view.window.app_name }} · {{ rectText(props.view.window.frame) }}
      </span>
      <ComputerUseTextMatches v-if="props.view.matches.length > 0" :matches="props.view.matches" />
    </template>

    <template v-else-if="props.view?.kind === 'click-text'">
      <span :class="LINE">
        <span :class="['i-mingcute:cursor-3-fill', LINE_ICON]" aria-hidden="true" />
        {{ t(`${KEY}.clicked-text`, { query: props.view.query }) }}
        <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.point) }}</span>
      </span>
      <span v-if="props.view.window" :class="['text-[11px] text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.window`) }} · {{ props.view.window.title }} · {{ props.view.window.app_name }} · {{ rectText(props.view.window.frame) }}
      </span>
      <ComputerUseTextMatches :matches="props.view.matches" :selected-index="props.view.selectedIndex" />
      <div v-if="props.view.options" :class="['flex flex-wrap items-center gap-1']">
        <span :class="CHIP">{{ label('buttons', props.view.options.button) }}</span>
        <span :class="CHIP">{{ label('clicks', props.view.options.click) }}</span>
        <ComputerUseKeycaps v-if="props.view.options.modifiers.length > 0" :keys="props.view.options.modifiers" />
        <span :class="CHIP">{{ props.view.options.policy }}</span>
        <span :class="CHIP">{{ props.view.options.windowStrategy }}</span>
      </div>
      <ComputerUseDelivery :action="props.view.action" />
    </template>

    <template v-else-if="props.view?.kind === 'text'">
      <span :class="LINE">
        <span :class="[props.view.mode === 'paste' ? 'i-mingcute:paste-fill' : 'i-mingcute:keyboard-fill', LINE_ICON]" aria-hidden="true" />
        {{ props.view.mode === 'paste' ? t(`${KEY}.pasted`) : t(`${KEY}.typed`) }}
      </span>
      <div :class="QUOTE">
        {{ props.view.text }}
      </div>
      <ComputerUseDelivery :action="props.view.action" />
    </template>

    <template v-else-if="props.view?.kind === 'keys'">
      <span :class="LINE">
        <span :class="['i-mingcute:command-fill', LINE_ICON]" aria-hidden="true" />
        {{ t(`${KEY}.pressed`) }}
        <ComputerUseKeycaps :keys="props.view.keys" />
        <span v-if="props.view.count" :class="['text-xs text-neutral-500']">{{ t(`${KEY}.repeat`, { count: props.view.count }) }}</span>
        <span v-if="props.view.intervalMs" :class="['text-xs text-neutral-500']">{{ t(`${KEY}.interval`, { ms: props.view.intervalMs }) }}</span>
        <span v-if="props.view.durationMs" :class="['text-xs text-neutral-500']">{{ t(`${KEY}.hold`, { ms: props.view.durationMs }) }}</span>
      </span>
      <ComputerUseDelivery :action="props.view.action" />
    </template>

    <template v-else-if="props.view?.kind === 'keyboard'">
      <span :class="LINE"><span :class="['i-mingcute:keyboard-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.steps`, { count: props.view.steps.length }, props.view.steps.length) }}</span>
      <div v-for="(step, index) in props.view.steps" :key="index" :class="['flex flex-col gap-1.5 rounded-lg px-2 py-1.5', 'bg-white dark:bg-neutral-900/60']">
        <span :class="['flex flex-wrap items-center gap-2 text-xs']">
          <span :class="['font-semibold tabular-nums text-primary-500 dark:text-primary-300']">{{ index + 1 }}</span>
          <ComputerUseKeycaps v-if="step.spec?.kind === 'press'" :keys="step.spec.keys" />
          <span v-else-if="step.spec?.kind === 'type_text'" :class="['break-words']">{{ t(`${KEY}.typed`) }} “{{ step.spec.text }}”</span>
          <code v-else-if="step.spec" :class="['break-all text-[11px]']">{{ step.spec.text }}</code>
        </span>
        <ComputerUseDelivery :action="step.action" />
      </div>
    </template>

    <template v-else-if="props.view?.kind === 'focus'">
      <span :class="LINE"><span :class="['i-mingcute:edit-2-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.focused`, { query: props.view.query }) }}</span>
      <div :class="FACTS">
        <span :class="FACT_LABEL">{{ t(`${KEY}.app`) }}</span><span :class="FACT_VALUE">{{ props.view.app }}</span>
        <span :class="FACT_LABEL">{{ t(`${KEY}.process`) }}</span><span :class="FACT_VALUE">{{ props.view.pid }}</span>
        <span :class="FACT_LABEL">{{ t(`${KEY}.control`) }}</span><span :class="FACT_VALUE">{{ props.view.role }}<template v-if="props.view.title"> · {{ props.view.title }}</template></span>
        <span :class="FACT_LABEL">{{ t(`${KEY}.value`) }}</span><span :class="FACT_VALUE">{{ props.view.value }}</span>
        <span :class="FACT_LABEL">{{ t(`${KEY}.ax-path`) }}</span><span :class="FACT_VALUE">{{ props.view.path }}</span>
      </div>
      <ComputerUseDelivery :action="props.view.action" />
    </template>

    <template v-else-if="props.view?.kind === 'move'">
      <span :class="LINE">
        <span :class="['i-mingcute:cursor-2-fill', LINE_ICON]" aria-hidden="true" />
        {{ t(`${KEY}.moved`) }} <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.point) }}</span>
      </span>
      <ComputerUseDelivery :action="props.view.action" />
    </template>

    <template v-else-if="props.view?.kind === 'click'">
      <span :class="LINE">
        <span :class="['i-mingcute:cursor-3-fill', LINE_ICON]" aria-hidden="true" />
        {{ t(`${KEY}.clicked`) }} <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.onScreen) }}</span>
        <span :class="CHIP">{{ label('buttons', props.view.button) }}</span>
        <span v-if="props.view.count" :class="CHIP">{{ t(`${KEY}.click-count`, { count: props.view.count }) }}</span>
        <span :class="CHIP">{{ label('relative', props.view.relativeTo) }}</span>
        <span v-if="props.view.normalized" :class="CHIP">{{ t(`${KEY}.normalized`) }}</span>
        <ComputerUseKeycaps v-if="props.view.modifiers.length > 0" :keys="props.view.modifiers" />
      </span>
      <div :class="FACTS">
        <span :class="FACT_LABEL">{{ t(`${KEY}.requested`) }}</span><span :class="FACT_VALUE">{{ pointText(props.view.requested) }}</span>
        <span :class="FACT_LABEL">{{ t(`${KEY}.on-screen`) }}</span><span :class="FACT_VALUE">{{ pointText(props.view.onScreen) }}</span>
      </div>
      <ComputerUseDelivery :action="props.view.action" />
    </template>

    <template v-else-if="props.view?.kind === 'drag'">
      <span :class="LINE">
        <span :class="['i-mingcute:hand-grab-fill', LINE_ICON]" aria-hidden="true" />
        {{ t(`${KEY}.dragged`) }}
        <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.start) }} → {{ pointText(props.view.end) }}</span>
        <span :class="CHIP">{{ label('buttons', props.view.button) }}</span>
        <span :class="CHIP">{{ t(`${KEY}.duration`, { ms: props.view.durationMs }) }}</span>
        <span :class="CHIP">{{ label('relative', props.view.relativeTo) }}</span>
        <span v-if="props.view.normalized" :class="CHIP">{{ t(`${KEY}.normalized`) }}</span>
      </span>
      <div :class="FACTS">
        <span :class="FACT_LABEL">{{ t(`${KEY}.requested`) }}</span>
        <span :class="FACT_VALUE">{{ pointText(props.view.requestedStart) }} → {{ pointText(props.view.requestedEnd) }}</span>
        <span :class="FACT_LABEL">{{ t(`${KEY}.final`) }}</span>
        <span :class="FACT_VALUE">{{ pointText(props.view.final) }}</span>
      </div>
      <ComputerUseDelivery :action="props.view.action" />
    </template>

    <template v-else-if="props.view?.kind === 'activate'">
      <span :class="LINE"><span :class="['i-mingcute:switch-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.activated`, { app: props.view.requested }) }}</span>
      <span :class="['inline-flex items-center gap-1 text-xs']">
        <template v-if="props.view.verification === 'verified_foreground'">
          <span :class="['i-mingcute:check-line', 'text-emerald-500']" aria-hidden="true" />
          {{ t(`${KEY}.in-front`) }}
        </template>
        <template v-else>
          <span :class="['i-mingcute:close-line', 'text-red-500']" aria-hidden="true" />
          {{ t(`${KEY}.front-is`, { app: props.view.observed }) }} · {{ props.view.verification }}
        </template>
      </span>
    </template>

    <template v-else-if="props.view?.kind === 'permissions'">
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

    <ComputerUseMediaState v-else-if="props.view?.kind === 'now-playing'" :state="props.view.state" />

    <template v-else-if="props.view?.kind === 'media'">
      <span :class="LINE">
        <span :class="['i-mingcute:music-2-fill', LINE_ICON]" aria-hidden="true" />
        {{ label('media.commands', props.view.command) }}
        <span :class="['inline-flex items-center gap-0.5 text-xs', props.view.verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500']">
          <span v-if="props.view.verified" :class="['i-mingcute:check-line']" aria-hidden="true" />
          {{ props.view.verified ? t(`${KEY}.media.verified`) : t(`${KEY}.media.not-verified`) }}
        </span>
      </span>
      <div :class="['grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2']">
        <div :class="['rounded-lg px-2 py-1.5', 'bg-white dark:bg-neutral-900/60']">
          <ComputerUseMediaState :state="props.view.before" compact />
        </div>
        <span :class="['i-mingcute:arrow-right-line', 'text-neutral-400']" aria-hidden="true" />
        <div :class="['rounded-lg px-2 py-1.5', 'bg-white dark:bg-neutral-900/60']">
          <ComputerUseMediaState :state="props.view.after" compact />
        </div>
      </div>
    </template>
  </div>
</template>
