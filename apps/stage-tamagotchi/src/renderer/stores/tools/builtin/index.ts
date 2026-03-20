import type { Tool } from '@xsai/shared-chat'

import { textJournalTools } from './text-journal'
import { widgetsTools } from './widgets'

export async function builtinTools(): Promise<Tool[]> {
  const groups = await Promise.all([
    widgetsTools(),
    textJournalTools(),
  ])

  return groups.flat()
}
