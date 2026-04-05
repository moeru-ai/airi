import type { PathKind } from '@proj-airi/visual-chat-shared'

import { mkdir } from 'node:fs/promises'

import { getVisualChatDir } from '@proj-airi/visual-chat-shared'

export type { PathKind }
export { getVisualChatDir }

export async function ensureDir(kind: PathKind): Promise<string> {
  const dir = getVisualChatDir(kind)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function ensureAllDirs(): Promise<Record<PathKind, string>> {
  const kinds: PathKind[] = ['config', 'data', 'cache', 'logs', 'models']
  const result = {} as Record<PathKind, string>
  for (const kind of kinds) {
    result[kind] = await ensureDir(kind)
  }
  return result
}
