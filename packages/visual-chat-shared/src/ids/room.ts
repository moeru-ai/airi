import { nanoid } from 'nanoid'

export function generateRoomName(): string {
  return `vc_${nanoid(12)}`
}

export function generateParticipantId(prefix: string = 'p'): string {
  return `${prefix}_${nanoid(10)}`
}
