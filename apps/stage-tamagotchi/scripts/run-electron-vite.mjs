import process from 'node:process'

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronViteEntry = require.resolve('electron-vite')
const cliPath = join(dirname(electronViteEntry), 'cli.js')
const rawArgs = process.argv.slice(2)
const args = rawArgs.length > 1 && rawArgs[1] === '--'
  ? [rawArgs[0], ...rawArgs.slice(2)]
  : rawArgs

if (args.length === 0) {
  console.error('Missing electron-vite command.')
  process.exit(1)
}

const env = { ...process.env }

// Electron can be forced into pure Node mode by an inherited shell variable.
// Strip it here so desktop scripts stay runnable even in polluted environments.
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [cliPath, ...args], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
