<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useMagicKeys, whenever } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import { defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const SearchCommandBox = defineAsyncComponent(() => import('./SearchCommandBox.vue'))

const open = ref(false)
const triggerRef = ref<HTMLElement>()
const overlayRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
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

let contentAnim: Animation | undefined
let overlayAnim: Animation | undefined

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Unwrap a reka-ui component ref to its DOM element ($el). */
function resolveElement(refValue: unknown): HTMLElement | undefined {
  const plain = (refValue as { $el?: unknown } | null | undefined)?.$el ?? refValue
  return plain instanceof HTMLElement ? plain : undefined
}

/** Wait for the async content to settle; a near-zero height would blow up the FLIP scale. */
async function waitForContent(
  getContent: () => HTMLElement | undefined,
  timeoutMs = 1500,
): Promise<HTMLElement | undefined> {
  const start = performance.now()
  let el: HTMLElement | undefined
  let prevHeight = -1
  while (performance.now() - start < timeoutMs) {
    // Bail out early if the dialog was closed while we were waiting.
    if (!open.value)
      return undefined
    await new Promise(resolve => requestAnimationFrame(resolve))
    el = getContent()
    if (!el)
      continue
    const height = el.getBoundingClientRect().height
    if (height > 0 && height === prevHeight)
      return el
    prevHeight = height
  }
  return el
}

/**
 * FLIP morph: animate the dialog from the search bar's rect (WAAPI, 0.2s);
 * closing replays it in reverse via the `data-state=closed` CSS animation.
 * Stores --morph-* for the close animation and cancels the WAAPI object
 * afterwards, otherwise it keeps locking transform and suppresses it.
 *
 * A run awaiting waitForContent must not apply animations once the dialog
 * has been closed (or reopened) in the meantime — guarded by `watchRun`.
 */
let watchRun = 0
watch(open, async (isOpen) => {
  const run = ++watchRun

  if (!isOpen) {
    // Snapshot the current computed state BEFORE cancelling the opening
    // animation: cancelling reverts to the class defaults (opacity-0), which
    // would make the closing animation jump to its `from` keyframe (full
    // opacity) first. Writing the snapshot into CSS variables lets the
    // closing keyframes start from the mid-flight state instead.
    const content = resolveElement(contentRef.value)
    if (content) {
      const current = getComputedStyle(content)
      content.style.setProperty('--morph-from-transform', current.transform)
      content.style.setProperty('--morph-from-opacity', current.opacity)
    }
    const overlay = resolveElement(overlayRef.value)
    if (overlay)
      overlay.style.setProperty('--morph-from-opacity', getComputedStyle(overlay).opacity)
  }

  contentAnim?.cancel()
  overlayAnim?.cancel()
  contentAnim = undefined
  overlayAnim = undefined

  if (!isOpen) {
    // Clear the open animation's inline styles so the CSS close animation can run.
    const content = resolveElement(contentRef.value)
    if (content) {
      content.style.transform = ''
      content.style.opacity = ''
    }
    return
  }

  const content = await waitForContent(
    () => resolveElement(contentRef.value) ?? document.querySelector<HTMLElement>('.search-dialog') ?? undefined,
  )
  // Stale guard: the dialog may have been closed (or reopened) while we were
  // waiting — abort, so the opening animation never applies to a closing dialog.
  if (run !== watchRun || !open.value)
    return

  const trigger = resolveElement(triggerRef.value)
  if (!trigger || !content)
    return

  const triggerRect = trigger.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()

  const scaleX = clamp(triggerRect.width / contentRect.width, 0.1, 1)
  const scaleY = clamp(triggerRect.height / contentRect.height, 0.1, 1)
  const translateX = (triggerRect.left + triggerRect.width / 2) - (contentRect.left + contentRect.width / 2)
  const translateY = (triggerRect.top + triggerRect.height / 2) - (contentRect.top + contentRect.height / 2)

  const { style } = content
  style.setProperty('--morph-x', `${translateX}px`)
  style.setProperty('--morph-y', `${translateY}px`)
  style.setProperty('--morph-sx', `${scaleX}`)
  style.setProperty('--morph-sy', `${scaleY}`)

  // Start at the search bar position (content is opacity-0, so no flash)
  style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`
  content.getBoundingClientRect() // force reflow so the initial state applies first

  const animation = content.animate(
    [
      { transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    // Nonlinear scale (fast-in, slow-out, no overshoot).
    { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
  )
  contentAnim = animation
  animation.finished
    .then(() => {
      animation.cancel()
      style.transform = ''
      style.opacity = '1' // cancel reverts to the class's opacity-0; keep it visible explicitly
      if (contentAnim === animation)
        contentAnim = undefined
    })
    .catch(() => {})

  const overlay = resolveElement(overlayRef.value)
  if (overlay) {
    const overlayAnimation = overlay.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    )
    overlayAnim = overlayAnimation
    overlayAnimation.finished
      .then(() => {
        overlayAnimation.cancel()
        overlay.style.opacity = '1'
        if (overlayAnim === overlayAnimation)
          overlayAnim = undefined
      })
      .catch(() => {})
  }
})
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
      <DialogOverlay
        ref="overlayRef"
        class="search-overlay fixed inset-0 z-30 bg-background/50 opacity-0 backdrop-blur-md"
      />
      <DialogContent
        ref="contentRef"
        class="search-dialog fixed inset-x-0 top-[10%] z-[100] mx-auto max-h-[85vh] max-w-[750px] w-[90vw] origin-center overflow-hidden border border-muted rounded-xl bg-card opacity-0 shadow-xl focus:outline-none"
      >
        <DialogTitle class="sr-only">
          Search documentation
        </DialogTitle>
        <DialogDescription class="sr-only">
          Show related results based on search term
        </DialogDescription>
        <SearchCommandBox @close="handleClose" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
