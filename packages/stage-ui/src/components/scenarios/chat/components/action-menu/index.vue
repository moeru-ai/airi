<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'

import type { ChatActionMenuAction } from '.'

import { useElementVisibility } from '@vueuse/core'
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
import { computed, inject, shallowRef, useTemplateRef } from 'vue'

import { createChatActionMenuItems } from '.'
import { useElementScroll } from '../../composables/use-element-scroll'
import { chatScrollContainerKey } from '../../constants'

const props = withDefaults(defineProps<{
  canCopy?: boolean
  canDelete?: boolean
  copyText?: string
  menuLabel?: string
  placement?: 'left' | 'right'
}>(), {
  canCopy: true,
  canDelete: true,
  copyText: '',
  menuLabel: 'Message actions',
  placement: 'right',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
}>()
defineSlots<{
  default: (props: { setMeasuredElement: (element: Element | ComponentPublicInstance | null) => void }) => unknown
}>()

const measuredElementRef = shallowRef<HTMLElement | null>(null)
const topSentinelRef = useTemplateRef<HTMLDivElement>('topSentinel')
const bottomSentinelRef = useTemplateRef<HTMLDivElement>('bottomSentinel')
const injectedScrollContainer = inject(chatScrollContainerKey, undefined)
const scrollTarget = computed(() => injectedScrollContainer?.value ?? null)
const contextMenuOpen = shallowRef(false)
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

const menuItems = computed(() => createChatActionMenuItems({
  canCopy: props.canCopy && props.copyText.trim().length > 0,
  canDelete: props.canDelete,
}))
const hasMenuItems = computed(() => menuItems.value.length > 0)
const forceVisible = computed(() => contextMenuOpen.value)

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

const showFloatingTrigger = computed(() => {
  if (!hasMenuItems.value || !messageIsVisible.value)
    return false

  return !topIsVisible.value || forceVisible.value
})

const floatingTriggerStyle = computed(() => (
  bottomIsVisible.value
    ? undefined
    : { top: `${floatingTop.value}px` }
))

const inlineTriggerStyle = computed(() => (
  bottomIsVisible.value
    ? undefined
    : { top: `${floatingTop.value}px` }
))

async function handleAction(action: ChatActionMenuAction) {
  if (action === 'copy') {
    if (props.copyText.trim()) {
      await navigator.clipboard.writeText(props.copyText)
      emit('copy')
    }
    return
  }

  emit('delete')
}

function handleContextMenuOpenChange(open: boolean) {
  contextMenuOpen.value = open
}

function setMeasuredElement(element: Element | ComponentPublicInstance | null) {
  measuredElementRef.value = element instanceof HTMLElement ? element : null
}
</script>

<template>
  <ContextMenuRoot @update:open="handleContextMenuOpenChange">
    <ContextMenuTrigger as-child>
      <div
        :class="['group/chat-action relative w-fit']"
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

        <DropdownMenuRoot>
          <DropdownMenuTrigger
            as-child
            :class="[
              'absolute z-10 opacity-0 transition-opacity duration-200',
              'group-hover/chat-action:opacity-100 group-focus-within/chat-action:opacity-100',
              forceVisible ? 'opacity-100' : '',
              props.placement === 'left' ? 'left-0 top-0 translate-x-[calc(-100%-8px)]' : 'right-0 top-0 translate-x-[calc(100%+8px)]',
            ]"
            :style="inlineTriggerStyle"
          >
            <button
              :class="[
                'pointer-events-auto h-8 w-8 flex items-center justify-center rounded-lg',
                'bg-white/85 text-neutral-500 backdrop-blur-sm',
                'dark:bg-neutral-900/85 dark:text-neutral-300',
                'transition-colors hover:text-primary-500 dark:hover:text-primary-300',
              ]"
              :aria-label="menuLabel"
            >
              <div class="i-solar:menu-dots-bold text-base" />
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

        <DropdownMenuRoot v-if="showFloatingTrigger">
          <div
            :class="[
              'pointer-events-none flex absolute',
              'group-hover/chat-action:opacity-100 group-focus-within/chat-action:opacity-100',
              'transition-opacity duration-200',
              forceVisible ? 'opacity-100' : '',
              props.placement === 'left' ? 'left-0' : 'right-0',
              props.placement === 'left' ? 'translate-x-[calc(-100%-8px)]' : 'translate-x-[calc(100%+8px)]',
              bottomIsVisible ? 'bottom-0' : 'top-0',
            ]"
            :style="floatingTriggerStyle"
          >
            <DropdownMenuTrigger as-child>
              <button
                :class="[
                  'pointer-events-auto h-8 w-8 flex items-center justify-center rounded-lg',
                  'bg-white/85 text-neutral-500 backdrop-blur-sm',
                  'dark:bg-neutral-900/85 dark:text-neutral-300',
                  'transition-colors hover:text-primary-500 dark:hover:text-primary-300',
                ]"
                :aria-label="menuLabel"
              >
                <div class="i-solar:menu-dots-bold text-base" />
              </button>
            </DropdownMenuTrigger>
          </div>

          <DropdownMenuPortal>
            <DropdownMenuContent
              align="end"
              side="bottom"
              :side-offset="6"
              :class="contentClasses"
            >
              <DropdownMenuItem
                v-for="item in menuItems"
                :key="`${item.action}-floating`"
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
        :class="contentClasses"
        :side-offset="6"
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
          <div :class="[item.icon, 'text-xs']" />
          <span>{{ item.label }}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
