<script setup lang="ts">
function enter(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  htmlEl.style.transition = 'all 0.5s'
  const width = htmlEl.scrollWidth
  htmlEl.style.width = '0'
  requestAnimationFrame(() => {
    htmlEl.style.width = `${width}px`
  })
  htmlEl.addEventListener('transitionend', done)
}

function beforeLeave(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.transition = 'all 0.5s'
  htmlEl.style.width = '0'
  htmlEl.style.opacity = '0'
}

function leave(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  htmlEl.style.transition = 'all 0.5s'
  htmlEl.style.width = '0'
  htmlEl.style.opacity = '0'
  htmlEl.addEventListener('transitionend', done)
}
</script>

<template>
  <Transition name="slide-fade" :css="false" @enter="enter" @leave="leave" @before-leave="beforeLeave">
    <slot />
  </Transition>
</template>
