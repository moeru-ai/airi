<script setup lang="ts">
import type { ComponentPublicInstance, ComputedRef, ShallowRef } from 'vue'

import type { ChatActionMenuAction } from '.'

import { errorMessageFromValue, isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { useElementVisibility, useEventListener } from '@vueuse/core'
import { animate } from 'animejs'
import { clamp } from 'es-toolkit'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, onUnmounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWebHaptics } from 'web-haptics/vue'

import { createChatActionMenuItems, createChatActionMenuTriggerState } from '.'
import { useBreakpoints } from '../../../../../composables/use-breakpoints'
import { useElementScroll } from '../../composables/use-element-scroll'

const props = withDefaults(defineProps<{
  canCopy?: boolean
  canReply?: boolean
  canRetry?: boolean
  canDelete?: boolean
  copyText?: string
  menuLabel?: string
  placement?: 'left' | 'right'
  pressFeedbackEnabled?: boolean
  scrollContainer?: HTMLElement | null
}>(), {
  canCopy: true,
  canReply: false,
  canRetry: false,
  canDelete: true,
  copyText: '',
  menuLabel: 'Message actions',
  placement: 'right',
  pressFeedbackEnabled: false,
  scrollContainer: null,
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'reply'): void
  (e: 'retry'): void
  (e: 'delete'): void
}>()
defineSlots<{
  default: (props: { setMeasuredElement: (element: Element | ComponentPublicInstance | null) => void }) => unknown
}>()

const measuredElementRef = shallowRef<HTMLElement | null>(null)
const contextMenuContainerElementRef = useTemplateRef<HTMLElement>('contextMenuContainer')
const topSentinelRef = useTemplateRef<HTMLDivElement>('topSentinel')
const bottomSentinelRef = useTemplateRef<HTMLDivElement>('bottomSentinel')
const scrollTarget = computed(() => props.scrollContainer)
const contextMenuOpen = shallowRef(false)
const dropdownMenuOpen = shallowRef(false)
const {
  innerHeight,
  innerTop,
  elementHeight,
  elementTop,
  hasMeasuredElement,
  isVisible: messageIsVisible,
  scrollTarget: effectiveScrollTarget,
} = useElementScroll(measuredElementRef, scrollTarget)

const topSentinelVisible = useElementVisibility(topSentinelRef, {
  initialValue: false,
  scrollTarget: effectiveScrollTarget,
})

const bottomSentinelVisible = useElementVisibility(bottomSentinelRef, {
  initialValue: false,
  scrollTarget: effectiveScrollTarget,
})

const { trigger } = useWebHaptics()
const { isMobile } = useBreakpoints()
const { t } = useI18n()
const shouldDisableDropdownMenu = computed(() => (isStageWeb() || isStageCapacitor()) && isMobile.value)
const pressFeedbackEnabled = computed(() => props.pressFeedbackEnabled)
const copyFeedbackActive = shallowRef(false)

const menuItems = computed(() => createChatActionMenuItems({
  canReply: props.canReply,
  canCopy: props.canCopy && props.copyText.trim().length > 0,
  canRetry: props.canRetry,
  canDelete: props.canDelete,
  retryLabel: t('stage.chat.actions.retry'),
  replyLabel: t('stage.chat.actions.reply'),
}))
const triggerState = computed(() => createChatActionMenuTriggerState({
  copyFeedbackActive: copyFeedbackActive.value,
}))
const hasMenuItems = computed(() => menuItems.value.length > 0)
const forceVisible = computed(() => contextMenuOpen.value || dropdownMenuOpen.value)

const contentClasses = [
  'chat-action-menu-content z-10000 min-w-36 rounded-xl p-1 shadow-md outline-none',
  'border border-neutral-100/70 bg-white/90 text-neutral-700 backdrop-blur-md',
  'dark:border-neutral-900/80 dark:bg-neutral-900/90 dark:text-neutral-100',
]

const itemClasses = [
  'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm leading-none outline-none',
  'data-[disabled]:pointer-events-none data-[highlighted]:bg-primary-50/80 dark:data-[highlighted]:bg-primary-900/40',
  'transition-colors duration-150 ease-in-out',
]

const topIsVisible = computed(() => topSentinelVisible.value)
const bottomIsVisible = computed(() => bottomSentinelVisible.value)
const floatingInMiddle = computed(() => !topIsVisible.value && !bottomIsVisible.value)

const floatingTop = computed(() => {
  if (!hasMeasuredElement.value || !messageIsVisible.value || !floatingInMiddle.value)
    return 0

  const buttonSize = 32
  const relativeInnerMiddle = innerTop.value - elementTop.value + innerHeight.value / 2 - buttonSize / 2
  return clamp(relativeInnerMiddle, 0, Math.max(elementHeight.value - buttonSize, 0))
})

const showFloatingTrigger = computed(() => !topIsVisible.value)

const triggerStyle = computed(() => (
  bottomIsVisible.value
    ? undefined
    : { top: `${floatingTop.value}px` }
))

function handleContextMenuOpenChange(open: boolean) {
  contextMenuOpen.value = open

  if (open)
    animateReleasedState()
}

function handleDropdownMenuOpenChange(open: boolean) {
  dropdownMenuOpen.value = open
}

function setMeasuredElement(element: Element | ComponentPublicInstance | null) {
  measuredElementRef.value = element instanceof HTMLElement ? element : null
}

/** Cancels long-press feedback after 8 pixels of touch travel. */
const PRESS_CANCEL_DISTANCE_PX = 8

function usePressing(
  elementRef: Readonly<ShallowRef<HTMLElement | null>>,
  enabled: Readonly<ComputedRef<boolean>>,
) {
  const isPressing = shallowRef(false)
  let pointerId: number | undefined
  let pointerStartX = 0
  let pointerStartY = 0

  function handlePointerDown(event: PointerEvent) {
    if (!enabled.value || event.pointerType !== 'touch' || !event.isPrimary)
      return

    pointerId = event.pointerId
    pointerStartX = event.clientX
    pointerStartY = event.clientY
    isPressing.value = true
  }

  function handlePointerEnd(event?: PointerEvent) {
    if (event && event.pointerId !== pointerId)
      return

    pointerId = undefined
    isPressing.value = false
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== pointerId)
      return

    const distance = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY)
    if (distance > PRESS_CANCEL_DISTANCE_PX)
      handlePointerEnd(event)
  }

  useEventListener(elementRef, 'pointerdown', handlePointerDown, { passive: true })
  // Track travel at window level before and after the surrounding swipe surface
  // captures a confirmed horizontal gesture.
  useEventListener(window, 'pointermove', handlePointerMove, { passive: true })
  useEventListener(window, ['pointerup', 'pointercancel'], handlePointerEnd, { passive: true })
  watch(enabled, (canPress) => {
    if (!canPress)
      handlePointerEnd()
  })

  return {
    isPressing,
  }
}

function useSetTimeoutFn(fn: () => void, options?: { delay?: number, onClear?: () => void }) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const delay = options?.delay ?? 1000

  function trigger(options?: { delay?: number }) {
    if (timeoutId !== null)
      return

    const effectiveDelay = options?.delay ?? delay

    timeoutId = setTimeout(() => {
      fn()
      timeoutId = null
    }, effectiveDelay)
  }

  function clear() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
      options?.onClear?.()
    }
  }

  return {
    trigger,
    clear,
  }
}

const { isPressing } = usePressing(contextMenuContainerElementRef, pressFeedbackEnabled)

const { trigger: triggerCopyFeedbackReset, clear: clearCopyFeedbackReset } = useSetTimeoutFn(() => {
  copyFeedbackActive.value = false
}, { delay: 1000 })

async function handleAction(action: ChatActionMenuAction) {
  if (action === 'reply') {
    emit('reply')
    return
  }

  if (action === 'copy') {
    if (!props.copyText.trim())
      return

    try {
      await navigator.clipboard.writeText(props.copyText)
      copyFeedbackActive.value = true
      clearCopyFeedbackReset()
      emit('copy')
      triggerCopyFeedbackReset()
    }
    catch (error) {
      console.error('Failed to copy text:', errorMessageFromValue(error))
    }

    return
  }

  if (action === 'retry') {
    emit('retry')
    return
  }

  emit('delete')
}

const pressedAnimatable = reactive({ scale: 100 })
const contextMenuPressOpenDelay = 250
let scaleAnimation: ReturnType<typeof animate> | undefined
let gestureReleased = true

function animatePressedState() {
  gestureReleased = false
  scaleAnimation?.cancel()
  scaleAnimation = animate(pressedAnimatable, {
    scale: 95,
    duration: contextMenuPressOpenDelay,
    ease: 'linear',
  })
}

function animateReleasedState() {
  if (gestureReleased)
    return

  gestureReleased = true
  scaleAnimation?.cancel()
  scaleAnimation = animate(pressedAnimatable, {
    scale: 100,
    duration: 220,
    ease: 'inOut(2)',
  })
}

const { trigger: triggerTimer, clear: clearTimer } = useSetTimeoutFn(() => {
  trigger('medium')
}, { delay: contextMenuPressOpenDelay })

watch(isPressing, (pressing) => {
  if (pressing) {
    animatePressedState()
    triggerTimer()
    return
  }

  clearTimer()
  animateReleasedState()
})

onUnmounted(() => scaleAnimation?.cancel())
</script>

<template>
  <ContextMenuRoot
    :press-open-delay="contextMenuPressOpenDelay"
    @update:open="handleContextMenuOpenChange"
  >
    <ContextMenuTrigger as-child>
      <div
        ref="contextMenuContainer"
        :data-pressing="isPressing"
        :class="[
          'group/chat-action relative w-fit',
        ]"
        :style="{
          transform: `scale(${pressedAnimatable.scale / 100})`,
        }"
      >
        <div
          ref="topSentinel"
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0"
        />
        <div
          ref="bottomSentinel"
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />

        <DropdownMenuRoot @update:open="handleDropdownMenuOpenChange">
          <DropdownMenuTrigger
            v-if="hasMenuItems && !shouldDisableDropdownMenu"
            as-child
            :class="[
              'absolute z-10 opacity-0 transition-opacity duration-200',
              'group-hover/chat-action:opacity-100 group-focus-within/chat-action:opacity-100',
              forceVisible ? 'opacity-100' : '',
              props.placement === 'left' ? 'left-0 translate-x-[calc(-100%-8px)]' : 'right-0 translate-x-[calc(100%+8px)]',
              showFloatingTrigger && bottomIsVisible ? 'bottom-0' : 'top-0',
            ]"
            :style="triggerStyle"
          >
            <button
              :class="[
                'h-8 w-8 flex items-center justify-center rounded-lg',
                'bg-white/85 text-neutral-500 backdrop-blur-sm',
                'dark:bg-neutral-900/85 dark:text-neutral-300',
                'transition-colors hover:text-primary-500 dark:hover:text-primary-300',
              ]"
              :aria-label="menuLabel"
            >
              <div
                :class="[
                  triggerState.icon,
                  'text-base',
                  triggerState.tone === 'success' ? 'text-emerald-600 dark:text-emerald-300' : '',
                ]"
              />
            </button>
          </DropdownMenuTrigger>

          <slot :set-measured-element="setMeasuredElement" />

          <DropdownMenuPortal>
            <DropdownMenuContent
              align="end"
              side="bottom"
              :side-offset="6"
              :class="contentClasses"
            >
              <DropdownMenuItem
                v-for="item in menuItems"
                :key="item.action"
                :class="[
                  ...itemClasses,
                  item.danger
                    ? 'text-red-500 data-[highlighted]:bg-red-50/80 dark:data-[highlighted]:bg-red-950/40'
                    : '',
                ]"
                @select="() => void handleAction(item.action)"
              >
                <div :class="[item.icon, 'text-xs']" />
                <span>{{ item.label }}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent
        :class="[
          ...contentClasses,
        ]"
      >
        <ContextMenuItem
          v-for="item in menuItems"
          :key="item.action"
          :class="[
            ...itemClasses,
            item.danger
              ? 'text-red-500 data-[highlighted]:bg-red-50/80 dark:data-[highlighted]:bg-red-950/40'
              : '',
          ]"
          @select="() => void handleAction(item.action)"
        >
          <div
            :class="[
              item.icon, 'text-xs',
            ]"
          />
          <span>
            {{ item.label }}
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<style>
.chat-action-menu-content {
  transform-origin: var(--reka-context-menu-content-transform-origin);
  will-change: opacity, transform;
}

.chat-action-menu-content[data-state="open"] {
  animation: chat-action-menu-elastic-in 220ms linear both;
}

.chat-action-menu-content[data-state="closed"] {
  animation: chat-action-menu-out 120ms ease-in both;
}

@keyframes chat-action-menu-elastic-in {
  0% {
    opacity: 0;
    transform: scale(0.72);
  }

  42% {
    opacity: 1;
    transform: scale(1.035);
  }

  64% {
    transform: scale(0.985);
  }

  82% {
    transform: scale(1.006);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes chat-action-menu-out {
  from {
    opacity: 1;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(0.96);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-action-menu-content[data-state] {
    animation: none;
  }
}
</style>
