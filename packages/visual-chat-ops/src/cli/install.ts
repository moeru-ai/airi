import process from 'node:process'

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

import { getVisualChatDir } from '@proj-airi/visual-chat-shared'

export async function install() {
  console.log('=== AIRI Visual Chat Dependency Installer ===\n')

  const dirs = ['config', 'data', 'cache', 'logs', 'models'] as const
  for (const kind of dirs) {
    const dir = getVisualChatDir(kind)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.log(`  Created: ${dir}`)
    }
    else {
      console.log(`  Exists: ${dir}`)
    }
  }

  console.log('\n  Installing pnpm dependencies...')
  try {
    execSync('pnpm install', { stdio: 'inherit' })
  }
  catch {
    console.error('  pnpm install failed.')
    process.exitCode = 1
    return
  }

  console.log('\n  Building packages...')
  try {
    execSync('pnpm run build:packages', { stdio: 'inherit' })
  }
  catch {
    console.error('  Build failed.')
    process.exitCode = 1
    return
  }

  console.log('\nInstallation complete.')
}

install()
