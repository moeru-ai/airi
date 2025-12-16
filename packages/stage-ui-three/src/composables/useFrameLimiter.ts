import { ref, onMounted, onUnmounted } from 'vue'

export interface FrameLimiterOptions {
  targetFPS?: number
  minFPS?: number
}

export function useFrameLimiter(options: FrameLimiterOptions = {}) {
  const { targetFPS = 60, minFPS = 30 } = options

  const currentFPS = ref(targetFPS)
  const isThrottled = ref(false)
  const isVisible = ref(true)

  let lastFrameTime = 0
  let frameInterval = 1000 / targetFPS
  let animationId: number | null = null
  let callback: ((deltaTime: number) => void) | null = null

  function onVisibilityChange() {
    isVisible.value = !document.hidden
    isThrottled.value = document.hidden

    if (document.hidden) {
      setTargetFPS(minFPS)
    } else {
      setTargetFPS(targetFPS)
    }
  }

  function setTargetFPS(fps: number) {
    currentFPS.value = Math.max(minFPS, Math.min(fps, 120))
    frameInterval = 1000 / currentFPS.value
  }

  function tick(time: number) {
    animationId = requestAnimationFrame(tick)

    const delta = time - lastFrameTime

    if (delta < frameInterval) return

    const excessTime = delta % frameInterval
    lastFrameTime = time - excessTime

    if (callback) {
      callback(delta)
    }
  }

  function start(cb: (deltaTime: number) => void) {
    callback = cb
    lastFrameTime = performance.now()
    animationId = requestAnimationFrame(tick)
  }

  function stop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
    callback = null
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    stop()
  })

  return {
    currentFPS,
    isThrottled,
    isVisible,
    setTargetFPS,
    start,
    stop,
  }
}
