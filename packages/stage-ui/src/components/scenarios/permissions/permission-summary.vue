<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

/** One page of the flow, for example a permission or the voiceprint. */
export interface PermissionSummaryItem {
  id: string
  name: string
  icon: string
  /** True when the permission is allowed, or the feature is set up. */
  done: boolean
  /** The done state in words, for the check mark, for example "Granted". */
  doneLabel: string
  /** The result in words, for example "Skipped. You do not get reminders." */
  detail: string
}

defineProps<{
  items: readonly PermissionSummaryItem[]
}>()

const emit = defineEmits<{
  /** The user wants to set up the page at this index. */
  open: [index: number]
}>()

const { t } = useI18n()
</script>

<template>
  <div :class="['@container min-h-0 flex flex-1 flex-col']">
    <!-- No comment before this root, as in the page layout. A narrow page stacks and centers the parts. -->
    <div :class="['min-h-0 flex flex-1 flex-col items-center justify-center gap-6 text-center @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] @3xl:items-center @3xl:gap-12 @3xl:text-left']">
      <div :class="['flex flex-col gap-3.5']">
        <h2 :class="['m-0 text-2xl text-neutral-900 font-bold leading-tight @3xl:text-3xl dark:text-neutral-50']">
          {{ items.every(item => item.done) ? t('settings.dialogs.onboarding.permissions.flow.summary.title') : t('settings.dialogs.onboarding.permissions.flow.summary.almost') }}
        </h2>
        <p :class="['m-0 text-[15px] text-neutral-500 leading-relaxed dark:text-neutral-400']">
          {{ t('settings.dialogs.onboarding.permissions.flow.summary.body') }}
        </p>
      </div>
      <ul :class="['m-0 max-w-105 w-full flex flex-col list-none gap-2 p-0 text-left']">
        <li
          v-for="(item, index) in items"
          :key="item.id"
          :class="['flex items-center gap-3.5 rounded-2xl px-4 py-3.5', 'bg-neutral-100 dark:bg-neutral-800/50', 'animate-slideUpAndFade']"
          :style="{ animationDelay: `${index * 70}ms`, animationFillMode: 'both' }"
        >
          <span
            :class="[
              'size-9 shrink-0 flex items-center justify-center rounded-full',
              item.done
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/70 dark:text-primary-200'
                : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
            ]"
          >
            <span :class="[item.icon, 'size-4.5']" aria-hidden="true" />
          </span>
          <span :class="['min-w-0 flex flex-1 flex-col gap-0.5']">
            <span :class="['text-[15px] font-semibold']">{{ item.name }}</span>
            <span :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">{{ item.detail }}</span>
          </span>
          <span
            v-if="item.done"
            role="img"
            :aria-label="item.doneLabel"
            :class="['i-mingcute:check-circle-fill', 'size-5.5 shrink-0 text-green-600 dark:text-green-400']"
          />
          <Button
            v-else
            size="sm"
            :label="t('settings.dialogs.onboarding.permissions.flow.summary.setUp')"
            :aria-label="t('settings.dialogs.onboarding.permissions.flow.summary.setUpOne', { permission: item.name })"
            @click="emit('open', index)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
