import process from 'node:process'

import { spawn } from 'node:child_process'

const env = { ...process.env }

// Some Windows setups leak `ELECTRON_RUN_AS_NODE=1` into child processes.
// When that reaches `electron-vite dev`, Electron starts as plain Node.js,
// so imports like `import { BrowserWindow } from "electron"` fail at runtime.
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('pnpm', ['exec', 'electron-vite', 'dev'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: true,
})

let exiting = false

function shutdown() {
  if (exiting)
    return
  exiting = true

  if (process.platform === 'win32') {
    // On Windows, child.kill() only kills the shell wrapper, not the
    // process tree underneath.  `taskkill /T` terminates the whole tree.
    try {
      spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
    }
    catch {}
  }
  else {
    try {
      // Negative PID sends signal to the entire process group
      process.kill(-child.pid!, 'SIGTERM')
    }
    catch {
      child.kill('SIGTERM')
    }
  }

  setTimeout(() => process.exit(1), 2000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

child.once('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.once('exit', (code, signal) => {
  if (exiting)
    return process.exit(code ?? 0)

  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
