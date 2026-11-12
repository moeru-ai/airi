/** The response of `GET /api/v1/flux/capacitor/usage`. */
export interface CapacitorUsage {
  /** The last refill. Null without an active Capacitor. */
  startedAt: string | null
  /** The next recharge, or the expiry without a reset interval. */
  endsAt: string | null
  /** The Capacitor percent after each debit of the window, in time order. */
  records: { at: string, percent: number }[]
}

/**
 * What the curve says about the end of the window at the current pace.
 * `left` gives the percent that remains at the end. `empty` gives the time at which the Capacitor runs out.
 */
export type CapacitorForecast
  = | { kind: 'left', percent: number }
    | { kind: 'empty', at: Date }

/** The drawing of one refill window. Paths use a box of {@link CURVE_WIDTH} by {@link CURVE_HEIGHT}. */
export interface CapacitorCurve {
  startedAt: Date
  endsAt: Date
  /** The level from the window start to now. Each debit is a step down. */
  line: string
  /** The area under `line`. The card uses it as its fill. */
  area: string
  /** The point of the current percent. */
  now: { x: number, y: number }
  /** A straight line from `now` at the average pace of the window. Null when there is no forecast. */
  projection: string | null
  forecast: CapacitorForecast | null
}

export const CURVE_WIDTH = 1000
export const CURVE_HEIGHT = 100

/** A forecast from a shorter part of the window changes too much with one message. */
const MIN_FORECAST_ELAPSED = 0.05

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Builds the curve of the current refill window.
 * Returns null without a window, or before the window starts.
 *
 * @param usage - The window and its debits from the server.
 * @param percent - The current Capacitor percent from the balance read. It ends the curve.
 * @param now - The time of the current percent.
 */
export function capacitorCurve(usage: CapacitorUsage, percent: number, now: Date): CapacitorCurve | null {
  if (usage.startedAt === null || usage.endsAt === null)
    return null
  const startedAt = new Date(usage.startedAt)
  const endsAt = new Date(usage.endsAt)
  const length = endsAt.getTime() - startedAt.getTime()
  const elapsed = now.getTime() - startedAt.getTime()
  if (length <= 0 || elapsed < 0)
    return null

  const x = (time: number) => round(Math.min(1, Math.max(0, (time - startedAt.getTime()) / length)) * CURVE_WIDTH)
  const y = (value: number) => round((1 - Math.min(100, Math.max(0, value)) / 100) * CURVE_HEIGHT)

  // A full Capacitor starts the window. The level holds until a debit, then drops.
  const steps = usage.records
    .map(record => ({ time: new Date(record.at).getTime(), percent: record.percent }))
    .filter(record => record.time >= startedAt.getTime() && record.time <= now.getTime())
    .map(record => `H${x(record.time)} V${y(record.percent)}`)
  const nowPoint = { x: x(now.getTime()), y: y(percent) }
  const line = ['M0 0', ...steps, `H${nowPoint.x} V${nowPoint.y}`].join(' ')
  const area = `${line} V${CURVE_HEIGHT} H0 Z`

  const used = 100 - percent
  const remaining = endsAt.getTime() - now.getTime()
  if (used <= 0 || percent <= 0 || remaining <= 0 || elapsed / length < MIN_FORECAST_ELAPSED)
    return { startedAt, endsAt, line, area, now: nowPoint, projection: null, forecast: null }

  const pacePerMs = used / elapsed
  const left = percent - pacePerMs * remaining
  if (left > 0) {
    return {
      startedAt,
      endsAt,
      line,
      area,
      now: nowPoint,
      projection: `M${nowPoint.x} ${nowPoint.y} L${CURVE_WIDTH} ${y(left)}`,
      forecast: { kind: 'left', percent: Math.round(left) },
    }
  }
  const emptyAt = now.getTime() + percent / pacePerMs
  return {
    startedAt,
    endsAt,
    line,
    area,
    now: nowPoint,
    projection: `M${nowPoint.x} ${nowPoint.y} L${x(emptyAt)} ${CURVE_HEIGHT}`,
    forecast: { kind: 'empty', at: new Date(emptyAt) },
  }
}
