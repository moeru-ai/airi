<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useMagicKeys, whenever } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const SearchCommandBox = defineAsyncComponent(() => import('./SearchCommandBox.vue'))

const open = ref(false)
const triggerRef = ref<HTMLElement>()
const { meta_k } = useMagicKeys()
const { t } = useI18n()

whenever(meta_k!, (n) => {
  if (n)
    open.value = true
})

function handleClose() {
  requestAnimationFrame(() => {
    open.value = false
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Unwrap a reka-ui component ref to its DOM element ($el). */
function resolveElement(refValue: unknown): HTMLElement | undefined {
  const plain = (refValue as { $el?: unknown } | null | undefined)?.$el ?? refValue
  return plain instanceof HTMLElement ? plain : undefined
}

/**
 * Approximate FLIP offset from the search bar to the dialog, evaluated on the
 * fly for both the opening `initial` and closing `exit` targets (the trigger
 * stays in the DOM, so this works at either time). The dialog width is fixed
 * by CSS (w-[90vw] max-w-[750px], horizontally centered); the vertical target
 * approximates top-[10%] + half height, close enough for a 0.2s morph.
 */
function computeMorph() {
  const trigger = resolveElement(triggerRef.value)
  if (!trigger)
    return { tx: 0, ty: 0, scale: 1 }
  const rect = trigger.getBoundingClientRect()
  const contentW = Math.min(750, window.innerWidth * 0.9)
  return {
    tx: (rect.left + rect.width / 2) - window.innerWidth / 2,
    ty: (rect.top + rect.height / 2) - window.innerHeight * 0.35,
    scale: clamp(rect.width / contentW, 0.1, 1),
  }
}

const morph = ref({ tx: 0, ty: 0, scale: 1 })

// Compute before the dialog renders (pre-flush): `initial`/`exit` read this
// value when the Motion mounts, so the FLIP start point is already in place.
watch(open, (isOpen) => {
  if (isOpen)
    morph.value = computeMorph()
})

const morphInitial = computed(() => ({ opacity: 0, x: morph.value.tx, y: morph.value.ty, scale: morph.value.scale }))
const morphExit = computed(() => ({ opacity: 0, x: morph.value.tx, y: morph.value.ty, scale: morph.value.scale }))

// Nonlinear fast-in, slow-out, no overshoot — same timing as the previous WAAPI animation.
const morphTransition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger ref="triggerRef" class="text-md flex items-center border-muted rounded-lg px-3 py-[7px] text-muted-foreground transition-colors duration-200 ease-in-out space-x-2 md:border hover:bg-muted md:bg-card md:text-sm">
      <Icon icon="lucide:search" />
      <span class="hidden w-24 text-left lg:w-40 md:inline-flex">{{ t('docs.theme.search.title') }}</span>
      <span class="hidden text-xs prose md:inline-flex">
        <kbd>⌘ K</kbd>
      </span>
    </DialogTrigger>

    <DialogPortal>
      <AnimatePresence multiple>
        <DialogOverlay
          v-if="open"
          key="overlay"
          as-child
          force-mount
          class="search-overlay fixed inset-0 z-30 bg-background/50 backdrop-blur-md"
        >
          <Motion
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
            :transition="morphTransition"
          />
        </DialogOverlay>
        <DialogContent
          v-if="open"
          key="content"
          as-child
          force-mount
          class="search-dialog fixed inset-x-0 top-[10%] z-[100] mx-auto max-h-[85vh] max-w-[750px] w-[90vw] origin-center overflow-hidden border border-muted rounded-xl bg-card shadow-xl focus:outline-none"
        >
          <Motion
            :initial="morphInitial"
            :animate="{ opacity: 1, x: 0, y: 0, scale: 1 }"
            :exit="morphExit"
            :transition="morphTransition"
          >
            <DialogTitle class="sr-only">
              Search documentation
            </DialogTitle>
            <DialogDescription class="sr-only">
              Show related results based on search term
            </DialogDescription>
            <SearchCommandBox @close="handleClose" />
          </Motion>
        </DialogContent>
      </AnimatePresence>
    </DialogPortal>
  </DialogRoot>
</template>
