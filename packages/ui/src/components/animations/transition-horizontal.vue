<script setup lang="ts">
/**
 * Elements with inline styles. HTML, SVG, and MathML elements implement
 * {@link ElementCSSInlineStyle}.
 */
type TransitionHorizontalElement = Element & Pick<ElementCSSInlineStyle, 'style'>

function isTransitionHorizontalElement(el: Element): el is TransitionHorizontalElement {
  return 'style' in el
}

function enter(el: Element, done: () => void) {
  if (!isTransitionHorizontalElement(el)) {
    done()
    return
  }

  el.style.transition = 'all 0.5s'
  const width = el.scrollWidth
  el.style.width = '0'
  requestAnimationFrame(() => {
    el.style.width = `${width}px`
  })
  el.addEventListener('transitionend', done)
}

function beforeLeave(el: Element) {
  if (!isTransitionHorizontalElement(el))
    return

  el.style.transition = 'all 0.5s'
  el.style.width = '0'
  el.style.opacity = '0'
}

function leave(el: Element, done: () => void) {
  if (!isTransitionHorizontalElement(el)) {
    done()
    return
  }

  el.style.transition = 'all 0.5s'
  el.style.width = '0'
  el.style.opacity = '0'
  el.addEventListener('transitionend', done)
}
</script>

<template>
  <Transition
    name="slide-fade"
    :css="false"
    @enter="enter"
    @leave="leave"
    @before-leave="beforeLeave"
  >
    <slot />
  </Transition>
</template>
