<script setup lang="ts">
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle, DrawerTrigger } from 'vaul-vue'
import { watch } from 'vue'

const props = withDefaults(defineProps<{
  /** Names the dialog for both the visible heading and assistive technology. */
  title: string
  /** Sets the minimum drawer height while content can still expand to the shared maximum. @default 'content' */
  minimumHeight?: 'content' | 'half'
}>(), {
  minimumHeight: 'content',
})

const emit = defineEmits<{
  /** Fires after dismissal completes, so a consumer can open another modal. */
  afterClose: []
  /** Cancel when focus will move directly into another modal. */
  closeAutoFocus: [event: Event]
}>()

const open = defineModel<boolean>({ default: false })

// Vaul can emit a closed animation event during initialization. Only a real
// open-to-closed transition completes dismissal; reopening cancels that handoff.
let closing = false
watch(open, (value, previous) => {
  closing = !value && previous
}, { flush: 'sync' })

function finishAnimation(value: boolean) {
  if (value || open.value || !closing)
    return
  closing = false
  emit('afterClose')
}
</script>

<template>
  <!-- Only the handle owns drag gestures; menu actions and scrolling keep native pointer behavior. -->
  <DrawerRoot v-model:open="open" handle-only @animation-end="finishAnimation">
    <DrawerTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DrawerTrigger>
    <DrawerPortal>
      <DrawerOverlay :class="['fixed inset-0 z-[9999] bg-black/35']" />
      <DrawerContent
        :aria-describedby="undefined"
        :class="[
          'pointer-events-auto fixed inset-x-0 bottom-0 z-[9999] mx-auto max-w-lg',
          'max-h-[90dvh] flex flex-col rounded-t-[32px] outline-none shadow-xl',
          'bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
          'motion-reduce:animate-none motion-reduce:transition-none',
          props.minimumHeight === 'half' ? 'min-h-[50dvh]' : undefined,
        ]"
        @close-auto-focus="emit('closeAutoFocus', $event)"
      >
        <div :class="['shrink-0 px-5 pt-4']">
          <DrawerHandle :class="['mb-3 bg-neutral-300 dark:bg-neutral-600']" />
          <div :class="['mb-5 pt-2']">
            <DrawerTitle :class="['text-xl font-semibold tracking-tight']">
              {{ props.title }}
            </DrawerTitle>
          </div>
        </div>
        <div :class="['min-h-0 overflow-y-auto overscroll-contain px-5']">
          <slot />
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
