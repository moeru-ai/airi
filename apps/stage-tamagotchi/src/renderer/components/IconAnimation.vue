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
  zIndex?: number
}>()

const emit = defineEmits<{
  (e: 'animationEnded'): void
}>()

const isAnimating = ref(false)

const clsAndProps = computed(() => {
  return {
    opacity: isAnimating.value !== props.isReverse
      ? 1
      : 0, // this equals to opacity: isAnimating.value ? props.isReverse ? 1 : 0 : props.isReverse ? 0 : 1
    size: isAnimating.value !== props.isReverse
      ? 25
      : props.iconSize,
    position: isAnimating.value !== props.isReverse
      ? `calc(50dvw - 12.5rem), calc(50dvh - 12.5rem)`
      : props.position,
    textColor: isAnimating.value !== props.isReverse
      ? 'text-white'
      : props.textColor,
  }
})

const animationEndProps = ref<string[]>([])
const animationEnded = ref(false)

function handleAnimationEnded(e: TransitionEvent) {
  animationEndProps.value.push(e.propertyName)

  if (animationEndProps.value.includes('color')
    && animationEndProps.value.includes('width')
    && animationEndProps.value.includes('height')
    && animationEndProps.value.includes('transform')) {
    animationEnded.value = true
    emit('animationEnded')
  }
}

watch(() => props.started, newVal =>
  newVal && requestAnimationFrame(() => isAnimating.value = true))
</script>

<template>
  <div
    pointer-events-none fixed w="100dvw" h="100dvh"
    :style="{
      zIndex: animationEnded ? zIndex : undefined,
    }"
  >
    <div
      fixed inset-0 bg-primary-500 transition-opacity ease-linear :style="{
        opacity: clsAndProps.opacity,
        transitionDuration: `${duration}ms`,
      }"
    />
    <div
      fixed inset-0 ease-in-out :style="{
        width: `${clsAndProps.size}rem`,
        height: `${clsAndProps.size}rem`,
        transform: `translate(${clsAndProps.position})`,
        transitionDuration: `${duration}ms`,
      }" :class="[
        clsAndProps.textColor,
        props.icon,
        { 'transition-all': isAnimating },
      ]"
      @transitionend="handleAnimationEnded"
    />
  </div>
</template>
