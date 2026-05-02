import { nanoid } from 'nanoid'

export function generateWorkerId(): string {
  return `wrk_${nanoid(10)}`
}

export function generateRequestId(): string {
  return `req_${nanoid(12)}`
}
