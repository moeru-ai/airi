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
  return `calc(50vw - ${size / 2}rem), calc(50vh - ${size / 2}rem)`
})

const position = computed(() =>
  isAnimating.value
    ? (props.isReverse ? props.position : centerPosition.value)
    : (props.isReverse ? centerPosition.value : props.position),
)

const opacity = computed(() => {
  return isAnimating.value ? props.isReverse ? 0 : 1 : props.isReverse ? 1 : 0
})

const size = computed(() => {
  return isAnimating.value ? props.isReverse ? props.iconSize : 25 : props.isReverse ? 25 : props.iconSize
})

const textColor = computed(() => {
  return isAnimating.value ? props.isReverse ? props.textColor : 'text-white' : props.isReverse ? 'text-white' : props.textColor
})
</script>

<template>
  <div pointer-events-none fixed left-0 top-0 h-full w-full>
    <div
      bg-primary-500 pointer-events-none h-full w-full transition-opacity ease-linear :style="{
        opacity,
        transitionDuration: `${duration}ms`,
      }"
    />
    <div
      pointer-events-none
      fixed left-0 top-0 transition-all ease-in-out :style="{
        width: `${size}rem`,
        height: `${size}rem`,
        transform: `translate(${position})`,
        transitionDuration: `${duration}ms`,
      }" :class="[
        textColor,
        icon,
        { 'transition-all': isAnimating },
      ]"
      @transitionend="emit('animationEnded')"
    />
  </div>
</template>
