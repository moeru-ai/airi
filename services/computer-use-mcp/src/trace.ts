import type { Bounds, PointerTracePoint } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampPoint(x: number, y: number, bounds?: Bounds) {
  if (!bounds) {
    return { x, y }
  }

  return {
    x: clamp(x, bounds.x, bounds.x + bounds.width),
    y: clamp(y, bounds.y, bounds.y + bounds.height),
  }
}

export function buildPointerTrace(params: {
  from?: { x: number, y: number }
  to: { x: number, y: number }
  bounds?: Bounds
  steps?: number
}): PointerTracePoint[] {
  const steps = Math.max(params.steps ?? 14, 4)
  const fallbackStart = {
    x: params.to.x - 64,
    y: params.to.y - 48,
  }
  const start = clampPoint(params.from?.x ?? fallbackStart.x, params.from?.y ?? fallbackStart.y, params.bounds)
  const end = clampPoint(params.to.x, params.to.y, params.bounds)
  if (start.x === end.x && start.y === end.y) {
    return []
  }

  const control = clampPoint(
    start.x + ((end.x - start.x) * 0.55),
    start.y + ((end.y - start.y) * 0.2) - 18,
    params.bounds,
  )

  const points: PointerTracePoint[] = []
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps
    const inverse = 1 - t
    const x = (inverse * inverse * start.x) + (2 * inverse * t * control.x) + (t * t * end.x)
    const y = (inverse * inverse * start.y) + (2 * inverse * t * control.y) + (t * t * end.y)

    const nextPoint = {
      x: Math.round(x),
      y: Math.round(y),
      delayMs: index === steps ? 16 : 10,
    }
    const previousPoint = points.at(-1)
    if (previousPoint?.x === nextPoint.x && previousPoint.y === nextPoint.y) {
      continue
    }

    points.push(nextPoint)
  }

  const lastPoint = points.at(-1)
  if (!lastPoint || lastPoint.x !== end.x || lastPoint.y !== end.y) {
    points.push({
      x: end.x,
      y: end.y,
      delayMs: 16,
    })
  }

  return points
}
