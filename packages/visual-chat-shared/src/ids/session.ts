import { nanoid } from 'nanoid'

export function generateSessionId(): string {
  return `ses_${nanoid(16)}`
}
