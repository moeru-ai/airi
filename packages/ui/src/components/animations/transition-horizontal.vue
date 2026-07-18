<script setup lang="ts">
function enter(el: any, done: any) {
  el.style.transition = 'all 0.5s'
  const width = el.scrollWidth
  el.style.width = '0'
  requestAnimationFrame(() => {
    el.style.width = `${width}px`
  })
  el.addEventListener('transitionend', done)
}

function beforeLeave(el: any) {
  el.style.transition = 'all 0.5s'
  el.style.width = '0'
  el.style.opacity = '0'
}

function leave(el: any, done: any) {
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
