import { onMounted, ref } from 'vue'

export function useDeferredMount() {
  const isReady = ref(false)

  onMounted(() => {
    // NOTICE: yield the main thread to the browser to paint.
    // Other approaches work too, e.g. double RAF like here, or a setTimeout 0, or Suspense with async component, etc.
    // Virtualization somewhat helps, however, virtual list may break Ctrl-F and Ctrl-A.
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
