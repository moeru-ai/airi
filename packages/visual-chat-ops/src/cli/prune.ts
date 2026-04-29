import { getVisualChatDir } from '@proj-airi/visual-chat-shared'
import { DEFAULT_RETENTION, getDirectorySizeMb, pruneWithPolicy } from '@proj-airi/visual-chat-storage'

export async function prune() {
  console.info('=== AIRI Visual Chat Pruner ===\n')

  const cacheDir = getVisualChatDir('cache')
  const logsDir = getVisualChatDir('logs')
  const dataDir = getVisualChatDir('data')

  const dirs = [
    { name: 'Cache', path: cacheDir },
    { name: 'Logs', path: logsDir },
    { name: 'Data', path: dataDir },
  ]

  for (const { name, path } of dirs) {
    const sizeBefore = await getDirectorySizeMb(path)
    const { byAge, bySize } = await pruneWithPolicy(path, DEFAULT_RETENTION)
    const sizeAfter = await getDirectorySizeMb(path)
    console.info(`  ${name}: removed ${byAge} by age, ${bySize} by size (${sizeBefore.toFixed(1)}MB -> ${sizeAfter.toFixed(1)}MB)`)
  }

  console.info('\nPrune complete.')
}

prune()
