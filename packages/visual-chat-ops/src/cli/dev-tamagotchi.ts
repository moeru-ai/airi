import process from 'node:process'

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { stop } from './stop'

const CURRENT_DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT_DIR = resolve(CURRENT_DIR, '..', '..', '..', '..')

type SpawnCommand = [command: string, args: string[]]

function packageManagerCommand(args: string[]): SpawnCommand {
  if (process.platform === 'win32') {
    const command = process.env.ComSpec || 'cmd.exe'
    return [command, ['/d', '/s', '/c', ['pnpm', ...args].join(' ')]]
  }

  return ['pnpm', args]
}

function spawnWorkspaceCommand(args: string[]) {
  const [command, commandArgs] = packageManagerCommand(args)
  return spawn(command, commandArgs, {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
    },
    stdio: 'inherit',
  })
}

export async function devTamagotchi() {
  await stop()

  console.info('=== Starting AIRI Tamagotchi Visual Chat Dev ===\n')
  console.info('This flow starts the Electron renderer, gateway, worker, and remote phone sharing.')
  console.info()

  const devChild = spawnWorkspaceCommand([
    '-r',
    '-F',
    '@proj-airi/stage-tamagotchi',
    '-F',
    '@proj-airi/visual-chat-gateway',
    '-F',
    '@proj-airi/visual-chat-worker-minicpmo',
    '--parallel',
    'dev',
  ])

  const shareChild = spawnWorkspaceCommand([
    '-F',
    '@proj-airi/visual-chat-ops',
    'share:tamagotchi',
  ])

  let shuttingDown = false
  const shutdown = (exitCode: number) => {
    if (shuttingDown)
      return

    shuttingDown = true

    if (!shareChild.killed)
      shareChild.kill()
    if (!devChild.killed)
      devChild.kill()

    process.exit(exitCode)
  }

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  devChild.once('error', (error) => {
    console.error(error)
    shutdown(1)
  })
  devChild.once('exit', (code, signal) => {
    if (shuttingDown)
      return

    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.error(`[fatal] Tamagotchi dev exited unexpectedly with ${detail}.`)
    shutdown(code ?? 1)
  })

  shareChild.once('error', (error) => {
    console.error(error)
    shutdown(1)
  })
  shareChild.once('exit', (code, signal) => {
    if (shuttingDown)
      return

    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.error(`[fatal] Remote phone sharing exited unexpectedly with ${detail}.`)
    shutdown(code ?? 1)
  })

  await new Promise(() => {})
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution()) {
  void devTamagotchi().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
