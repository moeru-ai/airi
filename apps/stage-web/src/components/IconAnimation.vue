<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  icon: string
  iconSize: number // avoid conflict with unocss size prop
  position: string
  duration: number
  started: boolean
  textColor: string
  isReverse?: boolean
}>()

const emit = defineEmits<{
  (e: 'animationEnded'): void
}>()

const isAnimating = ref(false)

watch(() => props.started, (newVal) => {
  if (newVal) {
    requestAnimationFrame(() => {
      isAnimating.value = true
    })
  }
})

const centerPosition = computed(() => {
  const size = props.started ? 25 : props.iconSize
  return `calc(50dvw - ${size / 2}rem), calc(50dvh - ${size / 2}rem)`
})

const clsAndProps = computed(() => {
  return {
    opacity: isAnimating.value !== props.isReverse ? 1 : 0, // this equals to opacity: isAnimating.value ? props.isReverse ? 1 : 0 : props.isReverse ? 0 : 1
    size: isAnimating.value !== props.isReverse ? 25 : props.iconSize,
    position: isAnimating.value !== props.isReverse ? centerPosition.value : props.position,
    textColor: isAnimating.value !== props.isReverse ? 'text-white' : props.textColor,
  }
})
</script>

<template>
  <div pointer-events-none fixed inset-0>
    <div
      bg-primary-500 fixed inset-0 transition-opacity ease-linear :style="{
        opacity: clsAndProps.opacity,
        transitionDuration: `${duration}ms`,
      }"
    />
    <div
      fixed inset-0 transition-all ease-in-out :style="{
        width: `${clsAndProps.size}rem`,
        height: `${clsAndProps.size}rem`,
        transform: `translate(${clsAndProps.position})`,
        transitionDuration: `${duration}ms`,
      }" :class="[
        clsAndProps.textColor,
        props.icon,
        { 'transition-all': isAnimating },
      ]"
      @transitionend="emit('animationEnded')"
    />
  </div>
</template>
