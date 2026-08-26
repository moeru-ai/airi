import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { computed, onMounted, onUnmounted, ref } from 'vue'

export function useIconAnimation(icon: string) {
  const iconAnimationStarted = ref(false)
  const showAnimationComponent = ref(false)
  const animationIcon = ref(icon)

  const settingsStore = useSettings()
  const showIconAnimation = computed(() => showAnimationComponent.value && !settingsStore.disableTransitions && settingsStore.usePageSpecificTransitions)

  onMounted(() => {
    showAnimationComponent.value = true
    requestAnimationFrame(() => {
      iconAnimationStarted.value = true
    })
  })

  onUnmounted(() => {
    iconAnimationStarted.value = false
    showAnimationComponent.value = false
  })

  return {
    iconAnimationStarted,
    showIconAnimation,
    animationIcon,
  }
}
