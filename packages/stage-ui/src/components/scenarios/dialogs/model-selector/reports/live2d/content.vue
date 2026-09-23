<script setup lang="ts">
import type { Live2DValidationIssue, Live2DValidationReport } from '@proj-airi/stage-ui-live2d'

import { Button } from '@proj-airi/ui'
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { DrawerContent, DrawerDescription, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRootNested, DrawerTitle } from 'vaul-vue'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBreakpoints } from '../../../../../../composables/use-breakpoints'

const props = defineProps<{
  report: Live2DValidationReport
}>()

const emits = defineEmits<{
  (event: 'close'): void
  (event: 'confirm'): void
}>()

/** The MOC3 header stores a format enum, not the Cubism version number itself. */
const cubismVersionByMocVersion: Readonly<Record<number, string>> = {
  1: '3',
  2: '3.3',
  3: '4',
  4: '4.2',
  5: '5',
}

const { t } = useI18n()
const { isDesktop } = useBreakpoints()

const errorCount = computed(() => props.report.issues.filter(issue => issue.severity === 'error').length)
const warningCount = computed(() => props.report.issues.filter(issue => issue.severity === 'warning').length)
const modelTarget = computed(() => props.report.model.entryPoint ?? props.report.model.moc?.path ?? null)
const activeIssue = shallowRef<Live2DValidationIssue | null>(null)
const showIssueDrawer = shallowRef(false)
const modelTypeLabel = computed(() => {
  if (props.report.model.type === 'unknown')
    return t('settings.model-select.live2d-report.model.types.unknown')

  const format = props.report.model.type === 'model3' ? '.model3.json' : '.moc3'
  const mocVersion = props.report.model.moc?.version
  const cubismVersion = mocVersion === undefined ? undefined : cubismVersionByMocVersion[mocVersion]

  if (cubismVersion !== undefined)
    return t('settings.model-select.live2d-report.model.types.cubism', { version: cubismVersion, format })

  return t('settings.model-select.live2d-report.model.types.cubism-compatible', { format })
})

function formatMocSize(size: number): string {
  const sizeMb = size / 1024 / 1024
  if (sizeMb >= 0.01)
    return `${sizeMb.toFixed(2)} MB`
  return `${size} B`
}

function handleIssueClick(issue: Live2DValidationIssue) {
  if (isDesktop.value)
    return

  activeIssue.value = issue
  showIssueDrawer.value = true
}

watch(isDesktop, (desktop) => {
  if (!desktop)
    return

  showIssueDrawer.value = false
  activeIssue.value = null
})
</script>

<template>
  <div class="min-h-0 flex flex-1 flex-col">
    <div class="flex flex-col gap-5 overflow-y-auto pr-1 scrollbar-none">
      <div class="flex flex-col gap-3">
        <dl
          :class="[
            'rounded-xl p-3 text-sm',
            'bg-neutral-100/70 dark:bg-neutral-800/60',
          ]"
        >
          <div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ t('settings.model-select.live2d-report.model.title') }}
              </dt>
              <div class="text-xs text-neutral-500 font-medium dark:text-neutral-400">
                {{ modelTypeLabel }}
              </div>
            </div>
            <dd class="mt-2 min-w-0 break-all text-neutral-800 dark:text-neutral-100" :title="modelTarget ?? undefined">
              {{ modelTarget ?? '—' }}
              <div class="mt-1.5 flex items-center gap-2 text-xs text-neutral-500 tabular-nums dark:text-neutral-400">
                <span>{{ t('settings.model-select.live2d-report.model.files', { count: report.model.archiveFileCount }) }}</span>
                <span v-if="report.model.moc">{{ formatMocSize(report.model.moc.size) }}</span>
              </div>
            </dd>
          </div>
        </dl>

        <h3 class="text-sm text-neutral-900 font-semibold dark:text-neutral-100">
          {{ t('settings.model-select.live2d-report.resources.title') }}
        </h3>
        <dl class="grid grid-cols-4 gap-1.5 sm:gap-2">
          <div :class="['rounded-lg p-2 sm:rounded-xl sm:p-3', 'bg-neutral-100/70 dark:bg-neutral-800/60']">
            <dt class="text-[10px] text-neutral-500 sm:text-xs dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.motions') }}
            </dt>
            <dd class="mt-0.5 text-lg text-neutral-900 font-semibold tabular-nums sm:mt-1 sm:text-xl dark:text-neutral-100">
              {{ report.resources.motions.parsed }}
            </dd>
            <div class="mt-0.5 text-[11px] text-neutral-500 hidden sm:block dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.referenced-and-found', { referenced: report.resources.motions.referenced, found: report.resources.motions.discovered }) }}
            </div>
          </div>
          <div :class="['rounded-lg p-2 sm:rounded-xl sm:p-3', 'bg-neutral-100/70 dark:bg-neutral-800/60']">
            <dt class="text-[10px] text-neutral-500 sm:text-xs dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.expressions') }}
            </dt>
            <dd class="mt-0.5 text-lg text-neutral-900 font-semibold tabular-nums sm:mt-1 sm:text-xl dark:text-neutral-100">
              {{ report.resources.expressions.parsed }}
            </dd>
            <div class="mt-0.5 text-[11px] text-neutral-500 hidden sm:block dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.referenced-and-found', { referenced: report.resources.expressions.referenced, found: report.resources.expressions.discovered }) }}
            </div>
          </div>
          <div :class="['rounded-lg p-2 sm:rounded-xl sm:p-3', 'bg-neutral-100/70 dark:bg-neutral-800/60']">
            <dt class="text-[10px] text-neutral-500 sm:text-xs dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.parameters') }}
            </dt>
            <dd class="mt-0.5 text-lg text-neutral-900 font-semibold tabular-nums sm:mt-1 sm:text-xl dark:text-neutral-100">
              {{ report.resources.parameters.parsed }}
            </dd>
            <div class="mt-0.5 text-[11px] text-neutral-500 hidden sm:block dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.found', { count: report.resources.parameters.parsed }) }}
            </div>
          </div>
          <div :class="['rounded-lg p-2 sm:rounded-xl sm:p-3', 'bg-neutral-100/70 dark:bg-neutral-800/60']">
            <dt class="text-[10px] text-neutral-500 sm:text-xs dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.textures') }}
            </dt>
            <dd class="mt-0.5 text-lg text-neutral-900 font-semibold tabular-nums sm:mt-1 sm:text-xl dark:text-neutral-100">
              {{ report.resources.textures.discovered }}
            </dd>
            <div class="mt-0.5 text-[11px] text-neutral-500 hidden sm:block dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.resources.referenced', { count: report.resources.textures.referenced }) }}
            </div>
          </div>
        </dl>
      </div>

      <section class="flex flex-col gap-3" aria-labelledby="live2d-report-issues-title">
        <div class="flex items-center justify-between gap-3">
          <h3 id="live2d-report-issues-title" class="text-sm text-neutral-900 font-semibold dark:text-neutral-100">
            {{ t('settings.model-select.live2d-report.issues.title') }}
          </h3>
          <div
            :class="[
              'rounded-full px-2.5 py-1 text-[11px] text-neutral-600 tabular-nums dark:text-neutral-300',
              'flex items-center gap-2',
              'bg-neutral-100/80 dark:bg-neutral-800/80',
            ]"
          >
            <span class="flex items-center gap-1">
              <span class="i-mingcute:close-circle-fill text-red-500 dark:text-red-400" aria-hidden="true" />
              {{ t('settings.model-select.live2d-report.issues.errors', { count: errorCount }) }}
            </span>
            <span class="h-3 w-px bg-neutral-300 dark:bg-neutral-600" aria-hidden="true" />
            <span class="flex items-center gap-1">
              <span class="i-mingcute:warning-fill text-amber-500 dark:text-amber-400" aria-hidden="true" />
              {{ t('settings.model-select.live2d-report.issues.warnings', { count: warningCount }) }}
            </span>
          </div>
        </div>

        <div
          v-if="report.issues.length === 0"
          :class="[
            'rounded-lg px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-200',
            'flex items-center gap-2',
            'bg-neutral-100/70 dark:bg-neutral-800/60',
          ]"
        >
          <span class="i-mingcute:check-circle-fill text-base text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
          <span>{{ t('settings.model-select.live2d-report.issues.none') }}</span>
        </div>

        <TooltipProvider v-else :delay-duration="250">
          <div class="flex flex-col gap-1.5">
            <TooltipRoot
              v-for="issue in report.issues"
              :key="`${issue.code}-${issue.message}`"
              :disabled="!isDesktop"
            >
              <TooltipTrigger as-child>
                <button
                  type="button"
                  :class="[
                    'w-full rounded-lg px-3 py-2.5 text-left text-sm text-neutral-700 outline-none dark:text-neutral-200',
                    'flex items-center gap-2.5',
                    'bg-neutral-100/70 transition-colors dark:bg-neutral-800/60',
                    'hover:bg-neutral-200/70 dark:hover:bg-neutral-700/60',
                    'focus-visible:ring-2 focus-visible:ring-neutral-400',
                    isDesktop ? 'cursor-help' : 'active:bg-neutral-200/70 dark:active:bg-neutral-700/60',
                  ]"
                  @click="handleIssueClick(issue)"
                >
                  <span
                    :class="[
                      'text-base',
                      issue.severity === 'error'
                        ? 'i-mingcute:close-circle-fill text-red-500 dark:text-red-400'
                        : 'i-mingcute:warning-fill text-amber-500 dark:text-amber-400',
                    ]"
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1">
                    {{ issue.message }}
                  </span>
                </button>
              </TooltipTrigger>

              <TooltipPortal v-if="isDesktop">
                <TooltipContent
                  side="right"
                  :side-offset="8"
                  :class="[
                    'live2d-report-tooltip z-[10001] max-w-64 rounded-lg px-3 py-2.5 text-sm shadow-lg outline-none',
                    'bg-neutral-900 text-neutral-50',
                  ]"
                >
                  <div>
                    <div class="mb-1 text-xs font-semibold tracking-wide opacity-60">
                      {{ t('settings.model-select.live2d-report.issues.how-to-fix') }}
                    </div>
                    <div>
                      {{ issue.resolution }}
                    </div>
                  </div>
                  <TooltipArrow class="fill-neutral-900" />
                </TooltipContent>
              </TooltipPortal>
            </TooltipRoot>
          </div>
        </TooltipProvider>

        <DrawerRootNested
          v-if="!isDesktop"
          v-model:open="showIssueDrawer"
        >
          <DrawerPortal>
            <DrawerOverlay class="fixed inset-0 z-[10000] bg-black/40" />
            <DrawerContent
              :class="[
                'fixed bottom-0 left-0 right-0 z-[10001] max-h-[70dvh]',
                'overflow-y-auto rounded-t-2xl bg-neutral-50 px-4 pt-3 shadow-xl outline-none dark:bg-neutral-900',
              ]"
              :style="{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }"
            >
              <DrawerHandle />

              <div v-if="activeIssue" class="mt-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-xs text-neutral-500 font-semibold dark:text-neutral-400">
                    <span
                      :class="[
                        'text-base',
                        activeIssue.severity === 'error'
                          ? 'i-mingcute:close-circle-fill text-red-500 dark:text-red-400'
                          : 'i-mingcute:warning-fill text-amber-500 dark:text-amber-400',
                      ]"
                      aria-hidden="true"
                    />
                    {{ t('settings.model-select.live2d-report.issues.how-to-fix') }}
                  </div>
                  <Button size="sm" @click="showIssueDrawer = false">
                    {{ t('settings.model-select.live2d-report.close') }}
                  </Button>
                </div>

                <DrawerTitle class="mt-4 text-base text-neutral-900 font-semibold dark:text-neutral-100">
                  {{ activeIssue.message }}
                </DrawerTitle>
                <DrawerDescription class="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                  {{ activeIssue.resolution }}
                </DrawerDescription>
              </div>
            </DrawerContent>
          </DrawerPortal>
        </DrawerRootNested>
      </section>
    </div>

    <div
      :class="[
        'mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800',
        'flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end',
      ]"
    >
      <div
        v-if="report.status === 'INVALID'"
        class="mr-auto flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
      >
        <span class="i-mingcute:warning-fill text-sm" aria-hidden="true" />
        {{ t('settings.model-select.live2d-report.issues.resolve-before-import') }}
      </div>
      <Button @click="emits('close')">
        {{ t('settings.model-select.live2d-report.actions.cancel') }}
      </Button>
      <Button v-if="report.status !== 'INVALID'" @click="emits('confirm')">
        {{ report.status === 'WARNING' ? t('settings.model-select.live2d-report.actions.import-anyway') : t('settings.model-select.live2d-report.actions.confirm') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
:global(.live2d-report-tooltip[data-state='delayed-open']),
:global(.live2d-report-tooltip[data-state='instant-open']) {
  animation: live2d-report-tooltip-fade-in 200ms ease-out;
}

@keyframes live2d-report-tooltip-fade-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(.live2d-report-tooltip[data-state]) {
    animation: none;
  }
}
</style>
