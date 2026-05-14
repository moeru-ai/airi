<script setup lang="ts">
import type { MaybeComputedElementRef } from '@vueuse/core'
import type { ComponentPublicInstance } from 'vue'

import type { ChatActionMenuAction } from '.'

import { errorMessageFrom } from '@moeru/std'
import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { useElementVisibility, useIntervalFn } from '@vueuse/core'
import { createTimeline } from 'animejs'
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
import { computed, inject, reactive, ref, shallowRef, toRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWebHaptics } from 'web-haptics/vue'

import { createChatActionMenuItems, createChatActionMenuTriggerState } from '.'
import { useBreakpoints } from '../../../../../composables/use-breakpoints'
import { useElementScroll } from '../../composables/use-element-scroll'
import { chatScrollContainerKey } from '../../constants'

const props = withDefaults(defineProps<{
  canCopy?: boolean
  canRetry?: boolean
  canDelete?: boolean
  copyText?: string
  menuLabel?: string
  placement?: 'left' | 'right'
}>(), {
  canCopy: true,
  canRetry: false,
  canDelete: true,
  copyText: '',
  menuLabel: 'Message actions',
  placement: 'right',
})

const emit = defineEmits<{
  (e: 'copy'): void
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
const injectedScrollContainer = inject(chatScrollContainerKey, undefined)
const scrollTarget = computed(() => injectedScrollContainer?.value ?? null)
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
const copyFeedbackActive = shallowRef(false)

const menuItems = computed(() => createChatActionMenuItems({
  canCopy: props.canCopy && props.copyText.trim().length > 0,
  canRetry: props.canRetry,
  canDelete: props.canDelete,
  retryLabel: t('stage.chat.actions.retry'),
}))
const triggerState = computed(() => createChatActionMenuTriggerState({
  copyFeedbackActive: copyFeedbackActive.value,
}))
const hasMenuItems = computed(() => menuItems.value.length > 0)
const forceVisible = computed(() => contextMenuOpen.value || dropdownMenuOpen.value)

const contentClasses = [
  'z-10000 min-w-36 rounded-xl p-1 shadow-md outline-none',
  'border border-neutral-100/70 bg-white/90 text-neutral-700 backdrop-blur-md',
  'dark:border-neutral-900/80 dark:bg-neutral-900/90 dark:text-neutral-100',
  'data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade',
  'data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade',
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
}

function handleDropdownMenuOpenChange(open: boolean) {
  dropdownMenuOpen.value = open
}

function setMeasuredElement(element: Element | ComponentPublicInstance | null) {
  measuredElementRef.value = element instanceof HTMLElement ? element : null
}

function useTouching(element: MaybeComputedElementRef) {
  const elementRef = toRef(element)

  const pressStartTime = ref(0)
  const pressNow = ref(0)

  const { resume, pause } = useIntervalFn(() => pressNow.value = Date.now(), 50)

  const isTouching = ref(false)
  const pressedFor = computed(() => {
    if (!isTouching.value || pressStartTime.value === 0)
      return 0

    const result = pressNow.value - pressStartTime.value
    if (result < 0)
      return 0

    return result
  })

  function handleTouchStart() {
    isTouching.value = true
    pressStartTime.value = Date.now()
    resume()
  }

  function handleTouchMove() {
    isTouching.value = true
  }

  function handleTouchEnd() {
    isTouching.value = false
    pressStartTime.value = 0
    pause()
  }

  function handleTouchCancel() {
    isTouching.value = false
    pressStartTime.value = 0
    pause()
  }

  watch(elementRef, (newElement) => {
    if (newElement) {
      const el = newElement as HTMLElement

      el.addEventListener('touchstart', handleTouchStart, { passive: true })
      el.addEventListener('touchmove', handleTouchMove, { passive: true })
      el.addEventListener('touchend', handleTouchEnd, { passive: true })
      el.addEventListener('touchcancel', handleTouchCancel, { passive: true })
    }
    else if (elementRef.value) {
      const el = elementRef.value as HTMLElement

      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, { immediate: true })

  return {
    isTouching,
    pressedFor,
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

const { isTouching } = useTouching(contextMenuContainerElementRef)

const { trigger: triggerCopyFeedbackReset, clear: clearCopyFeedbackReset } = useSetTimeoutFn(() => {
  copyFeedbackActive.value = false
}, { delay: 1000 })

async function handleAction(action: ChatActionMenuAction) {
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
      console.error('Failed to copy text:', errorMessageFrom(error) ?? String(error))
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
const tl = createTimeline({ defaults: { duration: 500, autoplay: false } })
  .add(pressedAnimatable, { scale: 90, ease: 'inOut', autoplay: false })
  .reset()

const { trigger: triggerTimer, clear: clearTimer } = useSetTimeoutFn(() => {
  trigger('medium')
  tl.reset()
}, { delay: 700 })

watch(isTouching, (val) => {
  if (val) {
    if (tl.completed || tl.paused) {
      tl.restart()
    }
    else {
      tl.play()
    }

    triggerTimer()
  }
  else {
    tl.reset()

    clearTimer()
  }
})
</script>

<template>
  <ContextMenuRoot @update:open="handleContextMenuOpenChange">
    <ContextMenuTrigger as-child>
      <div
        ref="contextMenuContainer"
        :class="[
          'group/chat-action relative w-fit',
          'transition-transform duration-150 ease-in-out',
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
