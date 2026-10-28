<script setup lang="ts">
import type { ChatHeaderButtonVariant } from './chat-header-button'

import { useHoverMenu } from '@proj-airi/stage-ui/components/scenarios/chat/composables/use-hover-menu'
import { danmakuFeedTiming, useDanmakuFeedSettings } from '@proj-airi/stage-ui/composables/use-danmaku-feed-settings'
import { DropdownMenu, Range } from '@proj-airi/ui'
import { DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { chatHeaderButtonClass } from './chat-header-button'

// The root holds the button and its menu, so a class from the parent goes to
// the button.
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  variant?: ChatHeaderButtonVariant
}>(), {
  variant: 'plain',
})

const { hideReadMessages, charactersPerSecond, minimumSeconds } = useDanmakuFeedSettings()
const { t } = useI18n()

// The hourglass is the switch for hiding read messages. Like the voice input
// button, it offers its settings in a menu that a hover, a right-click, or the
// down arrow opens.
const menu = useHoverMenu()
const menuOpen = menu.open

function toggleHideReadMessages() {
  hideReadMessages.value = !hideReadMessages.value
}

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

const itemClasses = [
  'w-full flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-left',
  'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
  'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
  'transition-colors duration-150 ease-in-out',
]
const labelClasses = ['px-3 pb-1 pt-2 text-xs text-neutral-500 dark:text-neutral-400']
const separatorClasses = ['mx-2 my-1 h-px bg-neutral-200/80 dark:bg-neutral-700/80']

function switchTrackClasses(on: boolean) {
  return [
    'relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none',
    on ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600',
  ]
}

function switchThumbClasses(on: boolean) {
  return [
    'absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none',
    on ? 'translate-x-4' : 'translate-x-0.5',
  ]
}
</script>

<template>
  <div :class="['relative']" @pointerenter="menu.enter()" @pointerleave="menu.leave()">
    <!--
      A plain button, like its neighbors in the header. GhostButton owns a
      darker text color that a caller cannot override reliably.
    -->
    <button
      v-bind="$attrs"
      :class="chatHeaderButtonClass(variant, hideReadMessages)"
      :title="`${t('tamagotchi.stage.chat-window.danmaku-feed.hide-read')} · ${t('tamagotchi.stage.chat-window.danmaku-feed.options-hint')}`"
      :aria-label="t('tamagotchi.stage.chat-window.danmaku-feed.hide-read')"
      :aria-pressed="hideReadMessages"
      @click="toggleHideReadMessages"
      @contextmenu.prevent="menu.openNow()"
      @keydown.down.prevent="menu.openNow()"
    >
      <div class="i-solar:hourglass-line-bold-duotone" />
    </button>
    <DropdownMenu
      v-model:open="menuOpen"
      :modal="false"
      align="end"
      variant="blurry"
      :side-offset="8"
      :content-class="['w-60']"
    >
      <template #trigger>
        <!--
          The menu anchors to the button. The button keeps its click for the switch, so this anchor takes no pointer
          input. A menu that closes gives the focus back to its trigger, which is this anchor, so the anchor draws no
          focus ring around the button.
        -->
        <span aria-hidden="true" tabindex="-1" :class="['pointer-events-none absolute inset-0 outline-none']" />
      </template>
      <div @pointerenter="menu.enter()" @pointerleave="menu.leave()">
        <!-- The item toggles the same setting as the hourglass, so the switch itself takes no input. -->
        <DropdownMenuCheckboxItem v-model="hideReadMessages" :class="itemClasses" @select.prevent>
          <span :class="['flex-1']">{{ t('tamagotchi.stage.chat-window.danmaku-feed.hide-read') }}</span>
          <span aria-hidden="true" :class="switchTrackClasses(hideReadMessages)">
            <span :class="switchThumbClasses(hideReadMessages)" />
          </span>
        </DropdownMenuCheckboxItem>
        <p :class="['px-3 pb-2 pt-1 text-xs text-neutral-500 leading-relaxed dark:text-neutral-400']">
          {{ t('tamagotchi.stage.chat-window.danmaku-feed.hide-read-description') }}
        </p>

        <template v-if="hideReadMessages">
          <DropdownMenuSeparator :class="separatorClasses" />
          <DropdownMenuLabel :class="labelClasses">
            {{ t('tamagotchi.stage.chat-window.danmaku-feed.title') }}
          </DropdownMenuLabel>
          <label
            v-for="slider in sliders"
            :key="slider.id"
            :class="['flex flex-col gap-1 px-3 py-1.5']"
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
      </div>
    </DropdownMenu>
  </div>
</template>
