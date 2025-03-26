import { onMounted, onUnmounted, ref } from 'vue'

export function useIconAnimation(icon: string) {
  const showIconAnimation = ref(false)
  const showAnimationComponent = ref(false)
  const animationIcon = ref(icon)

  onMounted(() => {
    showAnimationComponent.value = true
    requestAnimationFrame(() => {
      showIconAnimation.value = true
    })
  })

  onUnmounted(() => {
    showIconAnimation.value = false
    showAnimationComponent.value = false
  })

  return {
    showIconAnimation,
    showAnimationComponent,
    animationIcon,
  }
}
