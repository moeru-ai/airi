<script setup lang="ts">
import { Checkbox, Range } from '@proj-airi/ui'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { danmakuFeedTiming, useDanmakuFeedSettings } from '../../composables/use-danmaku-feed-settings'

// The root is the popover, which renders no element, so a class from the
// parent goes to the trigger button.
defineOptions({ inheritAttrs: false })

const { hideReadMessages, charactersPerSecond, minimumSeconds } = useDanmakuFeedSettings()
const { t } = useI18n()

const sliders = computed(() => [
  {
    id: 'reading-speed',
    label: t('tamagotchi.stage.chat-window.danmaku-feed.reading-speed'),
    value: t('tamagotchi.stage.chat-window.danmaku-feed.reading-speed-value', { count: charactersPerSecond.value }),
    model: charactersPerSecond,
    min: danmakuFeedTiming.charactersPerSecond.min,
    max: danmakuFeedTiming.charactersPerSecond.max,
  },
  {
    id: 'minimum-time',
    label: t('tamagotchi.stage.chat-window.danmaku-feed.minimum-time'),
    value: t('tamagotchi.stage.chat-window.danmaku-feed.minimum-time-value', { count: minimumSeconds.value }),
    model: minimumSeconds,
    min: danmakuFeedTiming.minimumSeconds.min,
    max: danmakuFeedTiming.minimumSeconds.max,
  },
])
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <!--
        A plain button, like its neighbors in the header. GhostButton owns a
        darker text color that a caller cannot override reliably.
      -->
      <button
        v-bind="$attrs"
        :class="[
          'h-7 w-7 flex items-center justify-center rounded-md outline-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
          'text-base transition-colors transition-transform active:scale-95',
          'text-neutral-400 hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
        ]"
        :title="t('tamagotchi.stage.chat-window.danmaku-feed.title')"
        :aria-label="t('tamagotchi.stage.chat-window.danmaku-feed.title')"
      >
        <div class="i-solar:hourglass-line-bold-duotone" />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="8"
        :class="[
          'z-50 w-60 flex flex-col gap-3 rounded-xl p-3 shadow',
          'bg-white text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
        ]"
      >
        <div :class="['flex flex-col gap-1']">
          <label :class="['flex items-center justify-between gap-3']">
            <span :class="['text-sm font-medium']">{{ t('tamagotchi.stage.chat-window.danmaku-feed.hide-read') }}</span>
            <Checkbox v-model="hideReadMessages" />
          </label>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('tamagotchi.stage.chat-window.danmaku-feed.hide-read-description') }}
          </p>
        </div>

        <template v-if="hideReadMessages">
          <div :class="['h-px bg-neutral-200/80 dark:bg-neutral-700/80']" />
          <label
            v-for="slider in sliders"
            :key="slider.id"
            :class="['flex flex-col gap-1']"
          >
            <span :class="['flex items-baseline justify-between gap-2']">
              <span :class="['text-sm']">{{ slider.label }}</span>
              <span :class="['text-xs tabular-nums text-neutral-500 dark:text-neutral-400']">{{ slider.value }}</span>
            </span>
            <!-- Range sizes its track in em, so the small text keeps it compact. -->
            <Range
              v-model="slider.model.value"
              :min="slider.min"
              :max="slider.max"
              :step="1"
              :class="['w-full text-xs']"
            />
          </label>
        </template>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
