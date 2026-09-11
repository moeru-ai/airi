<script setup lang="ts">
import type { AnnouncementContent } from '../../../composables/announcements'

import useEmblaCarousel from 'embla-carousel-vue'

import { useMediaQuery } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePromoBannerLayout } from './use-promo-banner-layout'

const props = withDefaults(defineProps<{
  items: AnnouncementContent[]
  /** Mobile readers keep text visible and select slides manually. @default false */
  mobile?: boolean
}>(), { mobile: false })
const { locale, t } = useI18n()
const { titleClass, descriptionClass, metaClass } = usePromoBannerLayout(locale)
// The parent retains the selected ID while the panel is closed. Its position is
// derived from the latest publication list so earlier expirations cannot skip it.
const selectedId = defineModel<string>('selectedId', { default: '' })
const current = computed(() => Math.max(0, props.items.findIndex(item => item.id === selectedId.value)))
const failedCovers = ref(new Set<string>())
const [_emblaRef, emblaApi] = useEmblaCarousel({ loop: true, slideChanges: false })
// Touch readers cannot keep hover active while reading or scrolling.
const canAutoplay = useMediaQuery('(hover: hover) and (pointer: fine)')
const hovered = ref(false)
const focused = ref(false)
let autoplayTimer: ReturnType<typeof setInterval> | undefined

// The mounted carousel owns autoplay. Reading with a pointer or keyboard pauses
// it; unmounting the carousel clears the timer.
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
const autoplayEnabled = computed(() => canAutoplay.value && !props.mobile && !hovered.value && !focused.value
  && !!emblaApi.value && props.items.length > 1)
watch(autoplayEnabled, (enabled) => {
  stopAutoplay()
  if (enabled)
    autoplayTimer = setInterval(() => emblaApi.value?.goToNext(), 5000)
})

watch(emblaApi, (api, _, onCleanup) => {
  if (!api)
    return
  const syncIndex = () => {
    const item = props.items[api.selectedSnap()]
    if (item)
      selectedId.value = item.id
  }
  api.goTo(current.value, true)
  api.on('select', syncIndex)
  api.on('reinit', syncIndex)
  onCleanup(() => {
    api.off('select', syncIndex)
    api.off('reinit', syncIndex)
  })
})

// Own slide-list reinitialization instead of Embla's mutation observer, which
// preserves a numeric snap. Wait for Vue's DOM update, then apply the ID's new
// position. Only removal of the selected item falls back to the first entry.
watch(() => props.items.map(item => item.id), (ids, previousIds) => {
  if (!ids.includes(selectedId.value))
    selectedId.value = ids[0] ?? ''
  if (previousIds && ids.length === previousIds.length && ids.every((id, index) => id === previousIds[index]))
    return
  emblaApi.value?.reInit({ startSnap: current.value })
}, { flush: 'post', immediate: true })

onBeforeUnmount(stopAutoplay)
</script>

<template>
  <div
    :class="['overflow-hidden rounded-3xl text-white']"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @click="focused = $event.detail === 0"
    @focusin="updateFocus"
    @focusout="updateFocus"
  >
    <div ref="_emblaRef" :class="['overflow-hidden rounded-3xl']">
      <div :class="['flex touch-pan-y items-start']">
        <article
          v-for="(item, index) in items" :key="item.id"
          :aria-label="item.title" :aria-hidden="index !== current" :inert="index !== current"
          :tabindex="index === current ? 0 : -1"
          :data-layout="item.layout"
          :data-mobile="props.mobile"
          :data-cover="!!item.coverUrl && !failedCovers.has(item.coverUrl)"
          :class="['announcement-slide relative min-w-0 flex-[0_0_100%]', props.mobile ? 'min-h-72' : 'h-60', 'break-words outline-none']"
        >
          <div :class="['pointer-events-none absolute inset-0', 'bg-gradient-to-br from-fuchsia-500/30 via-rose-400/18 to-transparent']" />
          <div
            v-if="item.coverUrl && !failedCovers.has(item.coverUrl)"
            :class="[
              'overflow-hidden',
              props.mobile && item.layout === 'landscape' ? 'relative mx-3 mt-3 h-52' : 'absolute',
              item.layout === 'portrait'
                ? 'inset-y-3 right-3 w-23 border border-white/10 rounded-2xl bg-white/5'
                : 'rounded-xl bg-black/15',
              item.layout === 'landscape' && !props.mobile ? 'inset-3' : '',
            ]"
          >
            <img
              :key="item.coverUrl" :src="item.coverUrl" :alt="t('stage.announcements.cover')"
              referrerpolicy="no-referrer"
              :class="['h-full w-full object-contain']"
              @error="failedCovers.add(item.coverUrl)"
            >
          </div>
          <div
            :class="[
              'announcement-text inset-0 px-4 pb-5 pt-4', props.mobile && item.layout === 'landscape' ? 'relative' : 'absolute',
              'transition-opacity duration-200',
              item.layout === 'portrait' && item.coverUrl && !failedCovers.has(item.coverUrl) ? 'right-28' : 'pr-12',
              item.layout === 'landscape' && !props.mobile ? 'bg-gradient-to-t from-neutral-950/95 via-neutral-950/80 to-neutral-950/45' : '',
            ]"
          >
            <div :class="['overflow-y-auto overscroll-contain', props.mobile && item.layout === 'landscape' ? 'max-h-52' : 'h-full']">
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
    <div v-if="items.length > 1" :class="['flex items-center justify-end gap-2 px-3 py-1']">
      <span :class="['shrink-0 text-[11px] text-white/60 font-600']">{{ current + 1 }}/{{ items.length }}</span>
      <div :class="['min-w-0 flex items-center overflow-x-auto']">
        <button
          v-for="(item, index) in items" :key="item.id"
          type="button" :aria-label="item.title" :aria-current="index === current ? 'true' : undefined"
          :class="['h-6 min-w-6 flex shrink-0 items-center justify-center rounded-full', 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-200']"
          @click="emblaApi?.goTo(index)"
        >
          <span :class="['h-2.5 rounded-full transition-all', index === current ? 'w-5 bg-white' : 'w-2.5 bg-white/30']" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Only the selected mobile slide determines the panel height. Offscreen slides
   keep their width for Embla navigation without leaving blank space below it. */
.announcement-slide[data-mobile='true'][aria-hidden='true'] {
  height: 0;
  min-height: 0;
  overflow: hidden;
}

/* Touch devices show text without hover. Keyboard focus reveals the same overlay
   as the pointer, and missing covers always leave the announcement readable. */
@media (hover: hover) and (pointer: fine) {
  .announcement-slide[data-layout='landscape'][data-cover='true'][data-mobile='false']:not(:hover):not(:focus-within) .announcement-text {
    opacity: 0;
    pointer-events: none;
  }
}
</style>
