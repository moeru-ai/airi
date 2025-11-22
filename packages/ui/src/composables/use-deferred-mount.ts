import { ref, onMounted } from "vue"

export const useDeferredMount = () => {
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