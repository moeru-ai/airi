import type { AuvDaemon } from '@auv-js/sdk/node'

import type { ComputerUseResult } from '../../../../shared/eventa/computer-use'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'

import { startAuv } from '@auv-js/sdk/node'

import * as v from 'valibot'

const execFileAsync = promisify(execFile)
const inputSchema = v.object({ argv: v.pipe(v.array(v.pipe(v.string(), v.maxLength(16384), v.check(value => !value.includes('\0')))), v.minLength(2), v.maxLength(128)) })

/** Owns one private daemon and serializes desktop operations across renderer windows. */
export function createComputerUseRuntime(options: { binaryPath: string, storeRoot: string }) {
  let daemon: AuvDaemon | undefined
  let socketDirectory: string | undefined
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  const abort = new AbortController()

  async function connect() {
    if (daemon)
      return daemon

    await cleanupSocket()
    let listener: string
    if (process.platform === 'win32') {
      listener = `npipe://./pipe/airi-auv-${randomUUID()}`
    }
    else {
      // Keep the socket separate from the long Electron user-data path.
      socketDirectory = await mkdtemp(join(await realpath(tmpdir()), 'auv-'))
      await chmod(socketDirectory, 0o700)
      listener = `unix://${join(socketDirectory, 's')}`
    }

    try {
      const started = await startAuv({
        binaryPath: options.binaryPath,
        storeRoot: options.storeRoot,
        listeners: [listener],
        noDiscovery: true,
        signal: abort.signal,
      })
      daemon = started
      void started.exited.then(() => {
        if (daemon === started)
          daemon = undefined
      })
      return started
    }
    catch (error) {
      await cleanupSocket()
      throw error
    }
  }

  async function cleanupSocket() {
    if (socketDirectory) {
      await rm(socketDirectory, { recursive: true, force: true })
      socketDirectory = undefined
    }
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(() => {
      if (disposed)
        throw new Error('Computer use has stopped.')
      return operation()
    })
    // A failed command must not prevent later commands from running.
    queue = next.then(() => undefined, () => undefined)
    return next
  }

  async function run(input: unknown): Promise<ComputerUseResult> {
    const { argv } = v.parse(inputSchema, input)
    if (argv[0] !== 'invoke' || !/^(?:--help|-h|help|(?:app|display|screen|window|input|mediaControl)\.[a-zA-Z]+)$/.test(argv[1]))
      throw new Error('Use invoke with a desktop command or --help.')

    // The host owns routing and artifact storage. CLI global flags must not replace them.
    const managedFlags = ['--store-root', '--endpoint', '--device', '--device-id', '--run', '--config', '--profile', '--discovery-file', '--pairing-store']
    if (argv.some(arg => managedFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`))))
      throw new Error('Computer use routing and storage are managed by AIRI.')

    return enqueue(async () => {
      const active = await connect()
      const command = [...argv]
      if (!command.includes('--json') && !command.includes('--help') && !command.includes('-h') && command[1] !== 'help')
        command.push('--json')
      command.push('--store-root', options.storeRoot)
      let stdout: string
      let stderr: string
      let exitCode = 0
      try {
        ({ stdout, stderr } = await execFileAsync(options.binaryPath, command, {
          env: { ...process.env, AUV_ENDPOINT: active.connectionOptions.endpoint, AUV_CONTEXT: undefined },
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          signal: abort.signal,
        }))
      }
      catch (error) {
        // Nonzero exits carry AUV's failure_details. Spawn failures and timeouts throw.
        if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'number'
          || ('killed' in error && error.killed) || !('stdout' in error) || typeof error.stdout !== 'string'
          || !('stderr' in error) || typeof error.stderr !== 'string') {
          throw error
        }
        exitCode = error.code
        stdout = error.stdout
        stderr = error.stderr
      }
      let output: unknown = stdout.trim()
      try {
        output = JSON.parse(stdout)
      }
      catch {
        // Help output is text. Keep it intact for command discovery.
      }
      return { argv, exitCode, output, stderr }
    })
  }

  async function readImage(input: unknown): Promise<string> {
    const { path } = v.parse(v.object({ path: v.string() }), input)
    return enqueue(async () => {
      const root = await realpath(options.storeRoot)
      const target = await realpath(path)
      const within = relative(root, target)
      if (!within || isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`))
        throw new Error('Only screenshots from this AIRI computer-use store can be read.')
      const info = await stat(target)
      if (!info.isFile() || info.size > 8 * 1024 * 1024)
        throw new Error('Screenshot must be a file smaller than 8 MiB.')
      const data = await readFile(target)
      const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255
      if (!png && !jpeg)
        throw new Error('Screenshot must be PNG or JPEG.')
      return `data:image/${png ? 'png' : 'jpeg'};base64,${data.toString('base64')}`
    })
  }

  /** Rejects queued calls, aborts active work, and waits for the owned daemon to exit. */
  async function dispose() {
    disposed = true
    abort.abort()
    await queue
    try {
      await daemon?.stop()
    }
    finally {
      await cleanupSocket()
    }
  }

  return { run, readImage, dispose }
}
