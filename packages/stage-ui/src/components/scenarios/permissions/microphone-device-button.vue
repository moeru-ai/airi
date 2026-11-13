<script setup lang="ts">
import { DropdownMenu, MenuRadioItem } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { DropdownMenuRadioGroup } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsAudioDevice } from '../../../stores/settings/audio-device'

defineProps<{
  /** The input level from 0 to 1. The selected device shows it as a meter. */
  level: number
}>()

const { t } = useI18n()
const { selectedAudioInput, audioInputOptions } = storeToRefs(useSettingsAudioDevice())

function labelOf(option: { label: string, value: string }) {
  // Chromium labels the default entry "Default - <device>". An entry without a label shows the generic name.
  return option.label !== option.value ? option.label : t('stage.chat.voice-composer.system-default')
}

const currentDevice = computed(() => {
  const option = audioInputOptions.value.find(item => item.value === selectedAudioInput.value)
  return option ? labelOf(option) : t('stage.chat.voice-composer.system-default')
})
</script>

<template>
  <DropdownMenu variant="blurry" :content-class="['min-w-[260px]']">
    <template #trigger>
      <button
        type="button"
        :aria-label="t('settings.dialogs.onboarding.permissions.flow.microphone.device', { device: currentDevice })"
        :class="[
          'max-w-full flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-sm outline-none',
          'bg-neutral-100 text-neutral-800 hover:bg-neutral-200/80 dark:bg-neutral-800/60 dark:text-neutral-100 dark:hover:bg-neutral-800',
          'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
      >
        <span :class="['size-9 shrink-0 flex items-center justify-center rounded-full', 'bg-primary-100/90 text-primary-600 dark:bg-primary-900/90 dark:text-primary-200']">
          <span :class="['i-mingcute:mic-line', 'size-5']" aria-hidden="true" />
        </span>
        <span :class="['min-w-0 truncate']">{{ currentDevice }}</span>
        <span :class="['i-mingcute:down-line', 'size-4 shrink-0 opacity-60']" aria-hidden="true" />
      </button>
    </template>
    <DropdownMenuRadioGroup v-model="selectedAudioInput">
      <MenuRadioItem v-for="option in audioInputOptions" :key="option.value" :value="option.value">
        <span :class="['min-w-0 flex flex-1 flex-col gap-1.5']">
          <span :class="['truncate']">{{ labelOf(option) }}</span>
          <span
            v-if="option.value === selectedAudioInput"
            aria-hidden="true"
            :class="['h-1 w-full overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10']"
          >
            <span
              :class="['block h-full rounded-full bg-primary-500 transition-[width] duration-75 motion-reduce:transition-none']"
              :style="{ width: `${Math.round(Math.min(1, level) * 100)}%` }"
            />
          </span>
        </span>
      </MenuRadioItem>
    </DropdownMenuRadioGroup>
  </DropdownMenu>
</template>
