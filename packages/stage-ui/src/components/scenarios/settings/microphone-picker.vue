<script setup lang="ts">
import type { MicrophonePermission } from '../../../composables/audio/audio-device'

import { errorMessageFrom } from '@moeru/std'
import { Button, Callout, FieldCombobox } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import OptionList from './option-list.vue'

import { useBreakpoints } from '../../../composables/use-breakpoints'

const props = withDefaults(defineProps<{
  label: string
  description?: string
  placeholder?: string
  options: { label: string, value: string }[]
  /** The microphone permission of the page. The picker shows the state that it implies. */
  permission: MicrophonePermission
  /**
   * Requests microphone access, so the browser lists its devices.
   * It resolves `false` or rejects when access is denied or no device opens.
   */
  requestAccess: () => Promise<boolean | void>
  /**
   * `list` shows the devices as rows, for a narrow screen or a drawer. `select` shows a compact select.
   * @default 'auto', which is `list` below the desktop breakpoint
   */
  layout?: 'auto' | 'list' | 'select'
}>(), { layout: 'auto' })

const selected = defineModel<string>({ required: true })

const { t } = useI18n()
const { isDesktop } = useBreakpoints()
const requesting = shallowRef(false)
const failure = shallowRef<string>()

const layout = computed(() => props.layout === 'auto' ? (isDesktop.value ? 'select' : 'list') : props.layout)

/**
 * What the picker shows:
 * - `devices`: the browser lists devices.
 * - `blocked`: the browser denied access. Only the site settings can allow it again, so the picker says where.
 * - `missing`: access is granted, but the browser lists no microphone.
 * - `ask`: the page has no access yet. Browsers list devices without IDs until then.
 */
const state = computed(() => {
  if (props.options.length > 0)
    return 'devices'
  if (props.permission === 'denied')
    return 'blocked'
  if (props.permission === 'granted')
    return 'missing'
  return 'ask'
})

const listOptions = computed(() => props.options.map(option => ({
  value: option.value,
  // Chromium labels the default entry "Default - <device>". An entry without a label shows the generic name.
  label: option.label !== option.value ? option.label : t('settings.pages.modules.hearing.sections.section.input-device.system-default'),
})))

/** A request from a click is a user gesture, so the browser shows its permission prompt. */
async function allow() {
  requesting.value = true
  failure.value = undefined
  try {
    if (await props.requestAccess() === false)
      failure.value = t('settings.pages.modules.hearing.sections.section.input-device.blocked-description')
  }
  catch (cause) {
    failure.value = errorMessageFrom(cause) ?? t('settings.pages.modules.hearing.sections.section.input-device.blocked-description')
  }
  finally {
    requesting.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-2']" data-testid="microphone-picker" :data-state="state" :data-layout="layout">
    <template v-if="state === 'devices' && layout === 'select'">
      <FieldCombobox
        v-model="selected"
        :label="label"
        :description="description"
        :options="options"
        :placeholder="placeholder"
        layout="vertical"
      />
    </template>

    <template v-else>
      <div :class="['flex flex-col gap-1']">
        <span :class="['text-sm font-medium']">{{ label }}</span>
        <span v-if="description" :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ description }}</span>
      </div>

      <OptionList v-if="state === 'devices'" v-model="selected" :label="label" :options="listOptions" />

      <div
        v-else-if="state === 'ask'"
        data-testid="microphone-picker-ask"
        :class="['flex items-center gap-3 px-3 py-3 rounded-xl', 'bg-neutral-100 dark:bg-neutral-800/60']"
      >
        <div :class="['i-solar:microphone-3-bold-duotone shrink-0 size-6 text-primary-500']" />
        <div :class="['flex flex-col flex-1 min-w-0 gap-0.5']">
          <span :class="['text-sm font-medium']">{{ t('settings.pages.modules.hearing.sections.section.input-device.allow') }}</span>
          <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ failure ?? t('settings.pages.modules.hearing.sections.section.input-device.allow-description') }}</span>
        </div>
        <Button size="sm" variant="primary" color="primary" :loading="requesting" @click="allow">
          {{ t('settings.pages.modules.hearing.sections.section.input-device.allow-action') }}
        </Button>
      </div>

      <Callout
        v-else-if="state === 'blocked'"
        data-testid="microphone-picker-blocked"
        theme="orange"
        :label="t('settings.pages.modules.hearing.sections.section.input-device.blocked')"
      >
        <div :class="['flex flex-col items-start gap-2']">
          <span>{{ t('settings.pages.modules.hearing.sections.section.input-device.blocked-description') }}</span>
          <Button size="sm" :loading="requesting" @click="allow">
            {{ t('settings.pages.modules.hearing.sections.section.input-device.retry') }}
          </Button>
        </div>
      </Callout>

      <div
        v-else
        data-testid="microphone-picker-missing"
        :class="['px-3 py-3 rounded-xl text-sm text-neutral-500 dark:text-neutral-400', 'bg-neutral-100 dark:bg-neutral-800/60']"
      >
        {{ t('settings.pages.modules.hearing.sections.section.input-device.missing') }}
      </div>
    </template>
  </div>
</template>
