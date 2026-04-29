import process from 'node:process'

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

import { getVisualChatDir } from '@proj-airi/visual-chat-shared'

export async function install() {
  console.info('=== AIRI Visual Chat Dependency Installer ===\n')

  const dirs = ['config', 'data', 'cache', 'logs', 'models'] as const
  for (const kind of dirs) {
    const dir = getVisualChatDir(kind)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.info(`  Created: ${dir}`)
    }
    else {
      console.info(`  Exists: ${dir}`)
    }
  }

  console.info('\n  Installing pnpm dependencies...')
  try {
    execSync('pnpm install', { stdio: 'inherit' })
  }
  catch {
    console.error('  pnpm install failed.')
    process.exitCode = 1
    return
  }

  console.info('\n  Building packages...')
  try {
    execSync('pnpm run build:packages', { stdio: 'inherit' })
  }
  catch {
    console.error('  Build failed.')
    process.exitCode = 1
    return
  }

  console.info('\nInstallation complete.')
}

install()
