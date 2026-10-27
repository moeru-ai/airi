import type { AuvDaemon } from '@auv-js/sdk/node'

import type { ComputerUseResult } from '../../../../shared/eventa/computer-use'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { promisify } from 'node:util'

import { startAuv } from '@auv-js/sdk/node'
import { Transformer } from '@napi-rs/image'

import * as v from 'valibot'

import { isComputerUseHelpCall } from '../../../../shared/eventa/computer-use'

const execFileAsync = promisify(execFile)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const inputSchema = v.object({ argv: v.pipe(v.array(v.pipe(v.string(), v.maxLength(16384), v.check(value => !value.includes('\0')))), v.minLength(2), v.maxLength(128)) })

/** Owns one private daemon and serializes desktop operations across renderer windows. */
export function createComputerUseRuntime(options: { binaryPath: string, storeRoot: string }) {
  let daemon: AuvDaemon | undefined
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  const abort = new AbortController()

  async function connect() {
    if (daemon)
      return daemon

    // The SDK creates a private socket or pipe and requires its launcher token from every local caller.
    const started = await startAuv({
      binaryPath: options.binaryPath,
      storeRoot: options.storeRoot,
      noRegister: true,
      signal: abort.signal,
    })
    daemon = started
    void started.exited.then(() => {
      if (daemon === started)
        daemon = undefined
    })
    return started
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
    const managedFlags = ['--credential-stdin', '--store-root', '--endpoint', '--device', '--device-id', '--run', '--config', '--profile', '--discovery-file', '--pairing-store']
    if (argv.some(arg => managedFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`))))
      throw new Error('Computer use routing and storage are managed by AIRI.')

    return enqueue(async () => {
      const active = await connect()
      const command = [...argv]
      if (!command.includes('--json') && !isComputerUseHelpCall(command))
        command.push('--json')
      command.push('--store-root', options.storeRoot)
      let stdout: string
      let stderr: string
      let exitCode = 0
      const credential = active.connectionOptions.credential
      if (!credential)
        throw new Error('AUV did not issue a launcher token.')
      try {
        // Send the launcher token on stdin. Other processes of the same user can read argv and the environment.
        const pending = execFileAsync(options.binaryPath, ['--credential-stdin', ...command], {
          // connectionOptions.endpoint is a bare socket path. The CLI needs the URI form from endpoints.
          env: { ...process.env, AUV_ENDPOINT: active.endpoints[0], AUV_CONTEXT: undefined },
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          signal: abort.signal,
        })
        // A CLI that exits before it reads stdin must not raise EPIPE as an unhandled error.
        pending.child.stdin?.on('error', () => {})
        pending.child.stdin?.end(`${credential}\n`)
        ;({ stdout, stderr } = await pending)
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
      if (!info.isFile() || info.size > MAX_IMAGE_BYTES)
        throw new Error('Screenshot must be a file smaller than 8 MiB.')
      const data = await readFile(target)
      const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255
      // AUV's Windows backend writes WebP. Convert it to PNG for providers that require PNG or JPEG.
      const webp = data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
      if (!png && !jpeg && !webp)
        throw new Error('Screenshot must be PNG, JPEG, or WebP.')
      if (webp) {
        abort.signal.throwIfAborted()
        let onAbort: (() => void) | undefined
        try {
          // NOTICE:
          // Disposal must stop waiting while the native codec finishes in the background.
          // N-API cannot cancel async work that already started.
          // Source: https://github.com/napi-rs/napi-rs/blob/main/crates/napi/src/bindgen_runtime/js_values/task.rs#L224-L230
          // Remove this race when the codec can interrupt running work.
          const pngData = await Promise.race([
            new Transformer(data).png(),
            new Promise<never>((_resolve, reject) => {
              onAbort = () => reject(new Error('Computer use has stopped.'))
              abort.signal.addEventListener('abort', onAbort, { once: true })
            }),
          ])
          if (pngData.length > MAX_IMAGE_BYTES)
            throw new Error('Screenshot must be smaller than 8 MiB after converting from WebP to PNG.')
          return `data:image/png;base64,${pngData.toString('base64')}`
        }
        finally {
          if (onAbort)
            abort.signal.removeEventListener('abort', onAbort)
        }
      }
      return `data:image/${png ? 'png' : 'jpeg'};base64,${data.toString('base64')}`
    })
  }

  /** Rejects queued calls, aborts active work, and waits for the owned daemon to exit. */
  async function dispose() {
    disposed = true
    abort.abort()
    await queue
    await daemon?.stop()
  }

  return { run, readImage, dispose }
}
