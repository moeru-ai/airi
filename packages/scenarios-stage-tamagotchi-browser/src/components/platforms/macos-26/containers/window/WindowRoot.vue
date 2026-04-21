<script setup lang="ts">
import type { CSSProperties, StyleValue } from 'vue'

import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useAttrs, watch } from 'vue'

import { injectPlatformLayout } from '../../constants'
import { computeElementAnchorStyle, createContainerAnchorStyle, createWorkAreaRect } from './window-anchor'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  title?: string
  focus?: boolean
  frame?: boolean
  transparent?: boolean
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
  hasShadow?: boolean
  anchorTo?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'center'
  anchorEl?: HTMLElement | SVGElement | null
  anchorBounds?: 'platform' | 'workarea'
}>(), {
  anchorBounds: 'platform',
  focus: true,
  frame: true,
  transparent: false,
  titleBarStyle: 'default',
  hasShadow: true,
})

const platformLayout = inject(injectPlatformLayout, null)
const attrs = useAttrs()
const windowRoot = ref<HTMLElement | null>(null)
const anchorStyle = shallowRef<CSSProperties | undefined>()
const incomingStyle = computed<StyleValue | undefined>(() => attrs.style as StyleValue | undefined)
const forwardedAttrs = computed(() => {
  const { style: _style, ...rest } = attrs
  return rest
})

let resizeObserver: ResizeObserver | null = null
let animationFrameId: number | null = null

function cancelPendingAnchorUpdate() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

function updateAnchorStyle() {
  if (!props.anchorTo) {
    anchorStyle.value = undefined
    return
  }

  const currentPlatformRoot = platformLayout?.root.value ?? null
  const currentWindowRoot = windowRoot.value
  const currentAnchorEl = props.anchorEl instanceof HTMLElement || props.anchorEl instanceof SVGElement
    ? props.anchorEl
    : null

  // Element anchoring is the more specific mode: align this window to the
  // measured target element inside the platform rather than to a platform edge.
  if (currentAnchorEl && currentPlatformRoot && currentWindowRoot) {
    anchorStyle.value = computeElementAnchorStyle({
      anchor: props.anchorTo,
      anchorRect: currentAnchorEl.getBoundingClientRect(),
      platformRect: currentPlatformRoot.getBoundingClientRect(),
      windowRect: currentWindowRoot.getBoundingClientRect(),
    })
    return
  }

  const platformRect = currentPlatformRoot?.getBoundingClientRect()
  // When anchoring against the container, we can optionally shrink the usable
  // bounds to the platform work area so windows avoid overlapping the dock.
  const dockRect = platformLayout?.dock.value
    ? platformLayout.dock.value.getBoundingClientRect()
    : null

  const workAreaRect = platformRect
    ? createWorkAreaRect({
        dockRect: props.anchorBounds === 'workarea' ? dockRect : null,
        platformRect,
      })
    : undefined

  anchorStyle.value = createContainerAnchorStyle(
    props.anchorTo,
    workAreaRect,
    platformRect
      ? {
          width: platformRect.width,
          height: platformRect.height,
        }
      : undefined,
  )
}

function queueAnchorUpdate() {
  cancelPendingAnchorUpdate()
  // Layout reads happen on the next animation frame so repeated prop/observer
  // changes collapse into one measurement pass.
  animationFrameId = requestAnimationFrame(() => {
    animationFrameId = null
    updateAnchorStyle()
  })
}

function refreshResizeObserver() {
  resizeObserver?.disconnect()

  if (typeof ResizeObserver === 'undefined') {
    return
  }

  resizeObserver = new ResizeObserver(() => {
    queueAnchorUpdate()
  })

  // The computed anchor can change when the platform, dock, window itself, or
  // an explicit anchor element resizes, so all of them feed the same update path.
  if (platformLayout?.root.value) {
    resizeObserver.observe(platformLayout.root.value)
  }

  if (platformLayout?.dock.value) {
    resizeObserver.observe(platformLayout.dock.value)
  }

  if (windowRoot.value) {
    resizeObserver.observe(windowRoot.value)
  }

  if (props.anchorEl instanceof HTMLElement || props.anchorEl instanceof SVGElement) {
    resizeObserver.observe(props.anchorEl)
  }
}

onMounted(async () => {
  await nextTick()
  queueAnchorUpdate()
  refreshResizeObserver()
})

watch(() => [
  props.anchorBounds,
  props.anchorTo,
  props.anchorEl,
  platformLayout?.uiScale.value,
  platformLayout?.dock.value,
  platformLayout?.root.value,
], async () => {
  await nextTick()
  queueAnchorUpdate()
  refreshResizeObserver()
})

onBeforeUnmount(() => {
  cancelPendingAnchorUpdate()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="windowRoot"
    v-bind="forwardedAttrs"
    :class="[
      'absolute',
      'flex flex-col',
      'rounded-2xl overflow-hidden',
      props.hasShadow ? 'shadow-xl' : '',
    ]"
    :style="[incomingStyle, anchorStyle]"
  >
    <div
      v-if="!!props.frame"
      :class="[
        'flex gap-2 px-2.5 py-2',
        'bg-white',
      ]"
    >
      <div
        :class="[
          'flex gap-2',
        ]"
      >
        <div :class="['bg-[#FF5C5F] dark:bg-[#FF5C5F]', 'size-3.5', 'rounded-full']" />
        <div :class="['bg-[#FAC800] dark:bg-[#FAC800]', 'size-3.5', 'rounded-full']" />
        <div :class="['bg-[#34C759] dark:bg-[#34C759]', 'size-3.5', 'rounded-full']" />
      </div>
      <div v-if="props.title">
        <span>{{ props.title }}</span>
      </div>
    </div>
    <div
      v-if="!!props.frame"
      :class="[
        'bg-[#E6E6E6] h-0.25 w-full',
      ]"
    />
    <div>
      <slot />
    </div>
  </div>
</template>
