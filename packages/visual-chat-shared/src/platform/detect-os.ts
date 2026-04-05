import { platform } from 'node:os'

export function detectOs(): ReturnType<typeof platform> {
  return platform()
}
