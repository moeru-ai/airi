<script setup lang="ts">
import type { DisplayModel } from '../../../../../stores/display-models'

import { usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDisplayModelsStore } from '../../../../../stores/display-models'

/**
 * A row of model thumbnails that scrolls sideways. A tap picks the model.
 * A model that is only in the account downloads first. Import, rename, and delete stay in the full model selector,
 * which the caller opens from the `actions` slot.
 */
const props = defineProps<{
  selectedId?: string
  /** The model that the stage is loading. Its thumbnail shows a spinner. */
  loadingId?: string
}>()

const emit = defineEmits<{
  pick: [model: DisplayModel]
}>()

const { t } = useI18n()

const displayModelStore = useDisplayModelsStore()
const { displayModels, cloudOnlyModels, syncStatuses } = storeToRefs(displayModelStore)

const models = computed(() => [
  ...displayModels.value.map(model => ({ id: model.id, name: model.name, previewImage: model.previewImage, cloudOnly: false })),
  ...cloudOnlyModels.value.map(model => ({ id: model.id, name: model.name, previewImage: undefined, cloudOnly: true })),
])

/**
 * The model that the user tapped, before the caller selects it. The thumbnail shows as selected at once,
 * so the bar can move while the stage still shows the old model.
 */
const pendingId = ref<string>()
const shownSelectedId = computed(() => pendingId.value ?? props.selectedId)

watch(() => props.selectedId, (id) => {
  if (id === pendingId.value)
    pendingId.value = undefined
})

/** The running stretch of the bar, if any. */
let indicatorAnimation: Animation | undefined

async function pick(id: string) {
  if (id === shownSelectedId.value)
    return

  pendingId.value = id
  // NOTICE:
  // The pick waits for the stretch to end. A model load during the stretch freezes the bar.
  // Root cause: stage-ui-live2d Model.vue parses on the main thread, and the bar animates layout.
  // Removal condition: the model parses off the main thread, or the bar animates only compositor properties.
  await nextTick()
  await indicatorAnimation?.finished.catch(() => undefined)

  try {
    const model = await displayModelStore.ensureDisplayModelAvailable(id)
    if (model)
      emit('pick', model)
    else if (pendingId.value === id)
      pendingId.value = undefined
  }
  catch (error) {
    if (pendingId.value === id)
      pendingId.value = undefined
    console.error('[model-strip] failed to download the selected model:', error)
  }
}

const list = useTemplateRef<HTMLElement>('list')

const indicator = useTemplateRef<HTMLElement>('indicator')
const reducedMotion = usePreferredReducedMotion()

/** The width of the bar at rest, in pixels. */
const INDICATOR_WIDTH = 20

/** The left edge of the bar at rest, in pixels from the start of the list. The bar sits under the selected thumbnail. */
const indicatorLeft = ref<number>()

/**
 * Moves the bar under the selected thumbnail. On a pick, the bar first stretches to cover the old and the new
 * thumbnail, then shrinks onto the new one. This is the elastic tab indicator, for example Android `TabLayout`
 * with `tabIndicatorAnimationMode="elastic"`. A resize moves the bar without the stretch.
 */
function placeIndicator(options: { stretch: boolean }) {
  const selected = list.value?.querySelector<HTMLElement>('[aria-checked="true"]')
  const from = indicatorLeft.value
  const to = selected ? selected.offsetLeft + (selected.offsetWidth - INDICATOR_WIDTH) / 2 : undefined
  indicatorLeft.value = to

  if (!options.stretch || from === undefined || to === undefined || from === to || reducedMotion.value === 'reduce')
    return

  const start = Math.min(from, to)
  const span = Math.abs(to - from) + INDICATOR_WIDTH
  indicatorAnimation = indicator.value?.animate([
    { left: `${from}px`, width: `${INDICATOR_WIDTH}px`, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)' },
    { left: `${start}px`, width: `${span}px`, offset: 0.4, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)' },
    { left: `${to}px`, width: `${INDICATOR_WIDTH}px` },
  ], { duration: 480 })
}

watch(shownSelectedId, () => placeIndicator({ stretch: true }), { flush: 'post' })
watch(models, () => placeIndicator({ stretch: false }), { flush: 'post' })
useResizeObserver(list, () => placeIndicator({ stretch: false }))

// The selected model can be far down the list. Start with it in view.
onMounted(() => {
  placeIndicator({ stretch: false })
  list.value?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
})
</script>

<template>
  <div :class="['flex items-center gap-1']">
    <div
      ref="list"
      role="radiogroup"
      :aria-label="t('settings.pages.models.editor.tabs.model')"
      :class="['relative min-w-0 flex flex-1 gap-2.5 overflow-x-auto pb-3 pt-1', 'snap-x scrollbar-none']"
    >
      <button
        v-for="model in models"
        :key="model.id"
        type="button"
        role="radio"
        :aria-checked="model.id === shownSelectedId"
        :aria-label="model.name"
        :aria-busy="model.id === pendingId || model.id === loadingId"
        :class="[
          'shrink-0 snap-start rounded-xl',
          'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="pick(model.id)"
      >
        <span
          :class="[
            'relative size-14 overflow-hidden rounded-xl',
            'flex items-center justify-center',
            'bg-neutral-200/50 dark:bg-neutral-800/60',
          ]"
        >
          <img
            v-if="model.previewImage"
            :src="model.previewImage"
            alt=""
            draggable="false"
            :class="['size-full object-cover object-top']"
          >
          <span
            v-else
            aria-hidden="true"
            :class="[
              model.cloudOnly ? 'i-mingcute:cloud-line' : 'i-mingcute:user-3-line',
              'size-6 text-neutral-500 dark:text-neutral-400',
              syncStatuses[model.id] === 'downloading' ? 'animate-pulse motion-reduce:animate-none' : '',
            ]"
          />
          <!-- A spinner covers the thumbnail from the tap until the stage shows the model. -->
          <Transition
            enter-active-class="transition-opacity duration-200"
            enter-from-class="opacity-0"
            leave-active-class="transition-opacity duration-200"
            leave-to-class="opacity-0"
          >
            <span
              v-if="model.id === pendingId || model.id === loadingId"
              aria-hidden="true"
              :class="['absolute inset-0 flex items-center justify-center', 'bg-neutral-50/60 dark:bg-neutral-900/60']"
            >
              <span :class="['i-mingcute:loading-3-line size-5 animate-spin text-primary-600 dark:text-primary-300']" />
            </span>
          </Transition>
        </span>
      </button>

      <!-- One short bar under the thumbnails marks the selected model. It stretches and shrinks onto the new model on a pick. -->
      <span
        v-if="indicatorLeft !== undefined"
        ref="indicator"
        aria-hidden="true"
        :style="{ left: `${indicatorLeft}px`, width: `${INDICATOR_WIDTH}px` }"
        :class="['absolute bottom-0.5 h-1 rounded-full', 'bg-primary-500 dark:bg-primary-400']"
      />
    </div>

    <!-- Actions after the thumbnails, for example a button that opens the full model selector. -->
    <slot name="actions" />
  </div>
</template>
