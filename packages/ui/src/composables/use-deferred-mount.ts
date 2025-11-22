import { onMounted, ref } from 'vue'

export function useDeferredMount() {
  const isReady = ref(false)

  onMounted(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isReady.value = true
      })
    })
  })

  return {
    isReady,
  }
}
