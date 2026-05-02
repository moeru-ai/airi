import { nanoid } from 'nanoid'

export function generateSourceId(): string {
  return `src_${nanoid(10)}`
}
