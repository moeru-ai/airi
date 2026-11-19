import { localDate } from '@proj-airi/stage-ui/libs/routines/schedule'

export function clockMinute(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(epoch)
  return Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value) + Number(parts.find(part => part.type === 'second')?.value) / 60
}

export function clockPoint(minute: number) {
  const angle = minute / 1440 * 2 * Math.PI - Math.PI / 2
  return { x: 120 + 90 * Math.cos(angle), y: 120 + 90 * Math.sin(angle) }
}

/** Clip yesterday's carry-in and tonight's overnight tail to the displayed local date. */
export function clockInterval(startAt: number, endAt: number, date: string, timeZone: string): [number, number] {
  return [localDate(startAt, timeZone) < date ? 0 : clockMinute(startAt, timeZone), localDate(endAt, timeZone) > date ? 1440 : clockMinute(endAt, timeZone)]
}

export function clockArc(start: number, end: number): string {
  const from = clockPoint(start)
  const to = clockPoint(end)
  return `M ${from.x} ${from.y} A 90 90 0 ${end - start > 720 ? 1 : 0} 1 ${to.x} ${to.y}`
}

/** Keep rotation continuous across midnight, anchored to this snapshot's local date. */
export function clockRotation(epoch: number, date: string, timeZone: string): number {
  const days = (Date.parse(`${localDate(epoch, timeZone)}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000
  return days * 360 + clockMinute(epoch, timeZone) / 4
}
