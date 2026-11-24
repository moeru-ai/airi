<script setup lang="ts">
import { DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle } from 'vaul-vue'

const props = defineProps<{
  /** Names the dialog for assistive technology. The drawer has no visible heading, so its content can start at the top. */
  title: string
}>()

const emit = defineEmits<{
  /** Lets the consumer choose the initial focus target. */
  openAutoFocus: [event: Event]
}>()

const open = defineModel<boolean>({ default: false })
</script>

<template>
  <!--
    The drawer comes in from the left edge, like the side menu of a phone app. A drag to the left closes it. Content that
    has its own horizontal gesture, for example a row with swipe actions, marks itself with `data-vaul-no-drag`.
  -->
  <DrawerRoot v-model:open="open" direction="left">
    <DrawerPortal>
      <DrawerOverlay :class="['fixed inset-0 z-[9999] bg-black/35']" />
      <DrawerContent
        :aria-describedby="undefined"
        :class="[
          'pointer-events-auto fixed inset-y-0 left-0 z-[9999] w-[min(22rem,86vw)]',
          'flex flex-col outline-none shadow-xl',
          'bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
          'motion-reduce:animate-none motion-reduce:transition-none',
        ]"
        @open-auto-focus="emit('openAutoFocus', $event)"
      >
        <DrawerTitle :class="['sr-only']">
          {{ props.title }}
        </DrawerTitle>
        <slot />
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
