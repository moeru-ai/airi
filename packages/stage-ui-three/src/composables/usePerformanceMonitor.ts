import { ref, onUnmounted } from 'vue'

export interface PerformanceStats {
  fps: number
  frameTime: number
  drawCalls: number
  triangles: number
  memory: number
}

export function usePerformanceMonitor() {
  const stats = ref<PerformanceStats>({
    fps: 0,
    frameTime: 0,
    drawCalls: 0,
    triangles: 0,
    memory: 0,
  })

  const enabled = ref(false)
  let frameCount = 0
  let lastTime = performance.now()
  let animationId: number | null = null

  function update() {
    frameCount++
    const now = performance.now()
    const delta = now - lastTime

    if (delta >= 1000) {
      stats.value.fps = Math.round((frameCount * 1000) / delta)
      stats.value.frameTime = Math.round(delta / frameCount * 100) / 100
      frameCount = 0
      lastTime = now

      if ((performance as any).memory) {
        stats.value.memory = Math.round((performance as any).memory.usedJSHeapSize / 1048576)
      }
    }

    if (enabled.value) {
      animationId = requestAnimationFrame(update)
    }
  }

  function start() {
    if (!enabled.value) {
      enabled.value = true
      lastTime = performance.now()
      frameCount = 0
      animationId = requestAnimationFrame(update)
    }
  }

  function stop() {
    enabled.value = false
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
  }

  function updateRendererStats(renderer: { info: { render: { calls: number; triangles: number } } }) {
    stats.value.drawCalls = renderer.info.render.calls
    stats.value.triangles = renderer.info.render.triangles
  }

  onUnmounted(() => {
    stop()
  })

  return {
    stats,
    enabled,
    start,
    stop,
    updateRendererStats,
  }
}
