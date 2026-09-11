<script setup lang="ts">
import { BasicButton, Button } from '@proj-airi/ui'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AnnouncementCarousel from './announcement-carousel.vue'

import { useAnnouncements } from '../../../composables/announcements'

const props = withDefaults(defineProps<{
  client: 'web' | 'desktop'
  /** The header anchors the card above mobile content; desktop uses a floating trigger. @default 'popover' */
  presentation?: 'popover' | 'header'
  /** Electron places the bell opposite its controls dock. @default 'left' */
  triggerSide?: 'left' | 'right'
}>(), { presentation: 'popover', triggerSide: 'left' })
const { locale, t } = useI18n()
const { announcements } = useAnnouncements(() => props.client, locale)
const open = defineModel<boolean>('open', { default: false })
const selectedId = ref('')
// Keep a keyboard-opened reading session paused, including focus on the close button.
const keyboardOpened = ref(false)
const triggerElement = ref<HTMLDivElement>()

// Electron tracks the floating trigger with native cursor coordinates and keeps
// input active while its portaled popover is open. The mobile header owns its trigger.
defineExpose({ triggerElement })
watch(announcements, (items) => {
  if (items.length === 0) {
    open.value = false
    selectedId.value = ''
  }
})
</script>

<template>
  <Teleport v-if="announcements.length" to="body" :disabled="presentation === 'header'">
    <div
      ref="triggerElement"
      :class="presentation === 'header' ? ['pointer-events-auto inline-flex'] : ['fixed bottom-10 z-50 pointer-events-auto', triggerSide === 'left' ? 'left-6' : 'right-6']"
    >
      <PopoverRoot v-model:open="open">
        <PopoverTrigger as-child @click="keyboardOpened = $event.detail === 0">
          <BasicButton
            v-if="presentation === 'header'"
            size="unset" :aria-label="t('stage.announcements.open')" :title="t('stage.announcements.open')"
            :class="[
              'announcement-trigger size-11 shrink-0 rounded-full backdrop-blur-md',
              'bg-neutral-50/70 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300',
              'focus-visible:outline-2 focus-visible:outline-primary-500',
            ]"
          >
            <span aria-hidden="true" :class="['i-solar:bell-outline size-6']" />
          </BasicButton>
          <Button
            v-else
            :class="['announcement-trigger']"
            icon="i-solar:bell-outline" :aria-label="t('stage.announcements.open')" :title="t('stage.announcements.open')" shape="circle"
          />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            :side="presentation === 'header' ? 'bottom' : 'top'"
            :align="presentation === 'header' || triggerSide === 'right' ? 'end' : 'start'" :side-offset="12"
            :aria-label="t('stage.announcements.title')"
            :class="[
              'announcement-island relative z-60 w-108 rounded-3xl outline-none',
              'border border-white/8 bg-neutral-900/86 shadow-xl backdrop-blur-xl',
              presentation === 'header' ? 'max-w-[calc(100vw-5rem)]' : 'max-w-[calc(100vw-3rem)]',
            ]"
          >
            <PopoverClose as-child>
              <button
                type="button" :aria-label="t('stage.announcements.close')"
                :class="[
                  'announcement-close absolute right-3 top-3 z-30 size-8 flex items-center justify-center rounded-full',
                  'bg-neutral-900/85 text-white/80 hover:text-white',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-200',
                ]"
              >
                <span :class="['i-lucide:x size-5']" />
              </button>
            </PopoverClose>
            <div :class="['announcement-content max-h-[var(--reka-popover-content-available-height)] overflow-y-auto rounded-3xl']">
              <AnnouncementCarousel v-model:selected-id="selectedId" :items="announcements" :mobile="presentation === 'header'" :paused="keyboardOpened" />
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
  </Teleport>
</template>

<style>
.announcement-trigger {
  opacity: 1;
  transition: opacity 100ms ease 180ms;
}

.announcement-trigger[data-state='open'] {
  opacity: 0;
  transition-delay: 0ms;
}

/* Reka places scoped attributes on its positioning wrapper. Component-owned
   classes target the portaled card itself. Reka owns presence and the exit
   animation. Its anchor dimensions map the collapsed clip to the bell without scaling card content. */
.announcement-island {
  --island-shift: calc(var(--reka-popover-trigger-height) + 12px);
  --island-top: calc(100% - var(--reka-popover-trigger-height));
  --island-bottom: 0px;
  --island-left: 0px;
  --island-right: calc(100% - var(--reka-popover-trigger-width));
}

.announcement-island[data-side='bottom'] {
  --island-shift: calc(-1 * (var(--reka-popover-trigger-height) + 12px));
  --island-top: 0px;
  --island-bottom: calc(100% - var(--reka-popover-trigger-height));
}

.announcement-island[data-align='end'] {
  --island-left: calc(100% - var(--reka-popover-trigger-width));
  --island-right: 0px;
}

.announcement-island[data-state='open'] {
  animation: announcement-expand 440ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.announcement-island[data-state='closed'] {
  pointer-events: none;
  animation: announcement-collapse 260ms cubic-bezier(0.4, 0, 0.8, 0.2) forwards;
}

.announcement-island[data-state='open'] .announcement-content,
.announcement-island[data-state='open'] .announcement-close {
  animation: announcement-reveal 280ms ease-out 100ms backwards;
}

.announcement-island[data-state='closed'] .announcement-content,
.announcement-island[data-state='closed'] .announcement-close {
  animation: announcement-reveal 120ms ease-in reverse forwards;
}

@keyframes announcement-expand {
  from {
    clip-path: inset(var(--island-top) var(--island-right) var(--island-bottom) var(--island-left) round calc(var(--reka-popover-trigger-height) / 2));
    transform: translateY(var(--island-shift));
  }
  to {
    clip-path: inset(0 round 24px);
    transform: translateY(0);
  }
}

@keyframes announcement-collapse {
  from {
    clip-path: inset(0 round 24px);
    transform: translateY(0);
  }
  to {
    clip-path: inset(var(--island-top) var(--island-right) var(--island-bottom) var(--island-left) round calc(var(--reka-popover-trigger-height) / 2));
    transform: translateY(var(--island-shift));
  }
}

@keyframes announcement-reveal {
  from { opacity: 0; filter: blur(4px); }
  to { opacity: 1; filter: blur(0); }
}

@media (prefers-reduced-motion: reduce) {
  .announcement-trigger { transition: none; }
  .announcement-island[data-state],
  .announcement-island[data-state] .announcement-content,
  .announcement-island[data-state] .announcement-close {
    animation: none;
  }
}
</style>
