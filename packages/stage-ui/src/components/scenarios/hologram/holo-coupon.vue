<script setup lang="ts">
import useEmblaCarousel from 'embla-carousel-vue'

import { Button } from '@proj-airi/ui'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAnnouncements } from '../../../composables/announcements'
import { usePromoBannerLayout } from './use-promo-banner-layout'

const props = defineProps<{ client: 'web' | 'desktop' }>()
const { locale, t } = useI18n()
const { announcements } = useAnnouncements(() => props.client, locale)
const { titleClass, descriptionClass, metaClass } = usePromoBannerLayout(locale)
const open = defineModel<boolean>('open', { default: false })
const triggerElement = ref<HTMLDivElement>()

// Electron tracks this element with native cursor coordinates. The open model
// keeps the window interactive while the portaled content is visible.
defineExpose({ triggerElement })
const current = ref(0)
const failedCovers = ref(new Set<string>())
const active = computed(() => announcements.value[current.value])
const [_emblaRef, emblaApi] = useEmblaCarousel({ loop: true })
const hovered = ref(false)
const focused = ref(false)
let autoplayTimer: ReturnType<typeof setInterval> | undefined

// The mounted popover owns autoplay. Reading with a pointer or keyboard pauses
// it; closing the popover or disposing the component clears the timer.
function updateFocus(event: FocusEvent) {
  const target = event.type === 'focusout' ? event.relatedTarget : event.target
  focused.value = target instanceof Element
    && event.currentTarget instanceof Element
    && event.currentTarget.contains(target)
    && target.matches(':focus-visible')
}

function stopAutoplay() {
  clearInterval(autoplayTimer)
  autoplayTimer = undefined
}

// Expiry updates the announcement list each second. Watch the playback decision
// so those updates do not restart the five-second timer.
const autoplayEnabled = computed(() => open.value && !hovered.value && !focused.value
  && !!emblaApi.value && announcements.value.length > 1)
watch(autoplayEnabled, (enabled) => {
  stopAutoplay()
  if (enabled)
    autoplayTimer = setInterval(() => emblaApi.value?.goToNext(), 5000)
})

watch(emblaApi, (api, _, onCleanup) => {
  if (!api)
    return
  const syncIndex = () => {
    current.value = api.selectedSnap()
  }
  api.goTo(current.value, true)
  api.on('select', syncIndex)
  api.on('reinit', syncIndex)
  onCleanup(() => {
    api.off('select', syncIndex)
    api.off('reinit', syncIndex)
  })
})

watch(open, () => {
  hovered.value = false
  focused.value = false
})

watch(announcements, (items) => {
  if (current.value >= items.length) {
    current.value = 0
    emblaApi.value?.goTo(0, true)
  }
  if (items.length === 0)
    open.value = false
})

onBeforeUnmount(stopAutoplay)
</script>

<template>
  <Teleport to="body">
    <div v-if="active" ref="triggerElement" :class="['fixed bottom-10 left-6 z-50', 'pointer-events-auto']">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger as-child>
          <Button
            icon="i-solar:gift-bold-duotone"
            :aria-label="t('stage.announcements.open')"
            :title="t('stage.announcements.open')"
            shape="circle"
          />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            side="top" align="start" :side-offset="12"
            :aria-label="t('stage.announcements.title')"
            :class="[
              'relative z-60 h-60 w-108 max-w-[calc(100vw-3rem)] overflow-hidden rounded-3xl shadow-2xl',
              'border border-white/8 bg-neutral-900/86 text-white backdrop-blur-xl',
              'ring-1 ring-black/10',
            ]"
            @mouseenter="hovered = true"
            @mouseleave="hovered = false"
            @click="focused = $event.detail === 0"
            @focusin="updateFocus"
            @focusout="updateFocus"
            @open-auto-focus.prevent
          >
            <PopoverClose as-child>
              <button
                type="button" :aria-label="t('stage.announcements.close')"
                :class="[
                  'absolute right-3 top-3 z-30 h-8 w-8 flex items-center justify-center rounded-full',
                  'bg-black/20 text-white/70 transition-colors hover:bg-black/40 hover:text-white',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-200',
                ]"
              >
                <span :class="['i-lucide:x h-5 w-5']" />
              </button>
            </PopoverClose>
            <div ref="_emblaRef" :class="['h-full overflow-hidden']">
              <div :class="['h-full flex touch-pan-y']">
                <article
                  v-for="(item, index) in announcements" :key="item.id"
                  :aria-label="item.title" :aria-hidden="index !== current" :inert="index !== current"
                  :tabindex="index === current ? 0 : -1"
                  :data-layout="item.layout"
                  :data-cover="!!item.coverUrl && !failedCovers.has(item.coverUrl)"
                  :class="['announcement-slide relative h-full min-w-0 flex-[0_0_100%]', 'break-words outline-none']"
                >
                  <div :class="['pointer-events-none absolute inset-0', 'bg-gradient-to-br from-fuchsia-500/30 via-rose-400/18 to-transparent']" />
                  <div
                    v-if="item.coverUrl && !failedCovers.has(item.coverUrl)"
                    :class="[
                      'absolute overflow-hidden',
                      item.layout === 'portrait'
                        ? 'inset-y-3 right-3 w-23 border border-white/10 rounded-2xl bg-white/5'
                        : 'inset-0',
                    ]"
                  >
                    <img
                      :key="item.coverUrl" :src="item.coverUrl" :alt="t('stage.announcements.cover')"
                      referrerpolicy="no-referrer"
                      :class="['h-full w-full object-cover']"
                      @error="failedCovers.add(item.coverUrl)"
                    >
                    <div v-if="item.layout === 'portrait'" :class="['pointer-events-none absolute inset-0', 'bg-gradient-to-t from-neutral-950/88 via-transparent to-white/8']" />
                  </div>
                  <div
                    :class="[
                      'announcement-text absolute inset-0 px-4 pb-11 pt-4',
                      'transition-opacity duration-200',
                      item.layout === 'portrait' && item.coverUrl && !failedCovers.has(item.coverUrl) ? 'right-28' : 'pr-12',
                      item.layout === 'landscape' ? 'bg-gradient-to-t from-neutral-950/95 via-neutral-950/80 to-neutral-950/45' : '',
                    ]"
                  >
                    <div :class="['h-full overflow-y-auto overscroll-contain']">
                      <div :class="['mb-3 flex items-center gap-1.5 text-white/72', metaClass]">
                        <span :class="['i-solar:calendar-mark-bold-duotone text-[13px] text-primary-200']" />
                        <time :datetime="item.startsAt">{{ new Date(item.startsAt).toLocaleDateString(locale, { month: '2-digit', day: '2-digit' }) }}</time>
                      </div>
                      <h2 :class="['text-white', titleClass]">
                        {{ item.title }}
                      </h2>
                      <p :class="['mt-2 whitespace-pre-wrap text-white/75', descriptionClass]">
                        {{ item.body }}
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            </div>
            <div v-if="announcements.length > 1" :class="['absolute bottom-2 right-3 z-30 flex items-center gap-2']">
              <span :class="['text-[11px] text-white/60 font-600']">{{ current + 1 }}/{{ announcements.length }}</span>
              <div :class="['flex flex-wrap items-center justify-center']">
                <button
                  v-for="(item, index) in announcements" :key="item.id"
                  type="button" :aria-label="item.title" :aria-current="index === current ? 'true' : undefined"
                  :class="['h-6 min-w-6 flex items-center justify-center rounded-full', 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-200']"
                  @click="emblaApi?.goTo(index)"
                >
                  <span :class="['h-2.5 rounded-full transition-all', index === current ? 'w-5 bg-white' : 'w-2.5 bg-white/30']" />
                </button>
              </div>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
  </Teleport>
</template>

<style scoped>
/* Touch devices show text without hover. Keyboard focus reveals the same overlay
   as the pointer, and missing covers always leave the announcement readable. */
@media (hover: hover) and (pointer: fine) {
  .announcement-slide[data-layout='landscape'][data-cover='true']:not(:hover):not(:focus-within) .announcement-text {
    opacity: 0;
    pointer-events: none;
  }
}
</style>
