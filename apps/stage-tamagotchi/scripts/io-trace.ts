import process, { env, platform } from 'node:process'

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { cac } from 'cac'

import { listIOTraceCaptures, summarizeIOTraceCapture } from '../src/main/services/airi/io-trace-recording/analysis'
import { readIOTraceCapture, readLatestIOTraceCapture } from '../src/main/services/airi/io-trace-recording/capture'

interface DirectoryOptions {
  directory?: string
}

interface SpanOptions extends DirectoryOptions {
  errors?: boolean
  name?: string
  subsystem?: string
  traceId?: string
}

function defaultCapturesDirectory() {
  if (env.AIRI_IO_TRACE_DIR)
    return resolve(env.AIRI_IO_TRACE_DIR)
  if (env.APP_USER_DATA_PATH)
    return resolve(env.APP_USER_DATA_PATH, 'io-traces')
  if (platform === 'darwin')
    return join(homedir(), 'Library', 'Application Support', 'AIRI', 'io-traces')
  if (platform === 'win32')
    return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'AIRI', 'io-traces')
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'AIRI', 'io-traces')
}

function capturesDirectory(options: DirectoryOptions) {
  return options.directory ? resolve(options.directory) : defaultCapturesDirectory()
}

async function resolveCapture(captureId: string | undefined, options: DirectoryOptions) {
  const directory = capturesDirectory(options)
  if (!captureId || captureId === 'latest') {
    const latest = await readLatestIOTraceCapture(directory)
    return {
      active: latest.active,
      capture: await readIOTraceCapture(latest.captureDirectory),
      captureDirectory: latest.captureDirectory,
    }
  }
  if (!/^[\w.-]+$/.test(captureId))
    throw new TypeError(`Invalid capture ID: ${captureId}`)
  const captureDirectory = join(directory, captureId)
  return { active: false, capture: await readIOTraceCapture(captureDirectory), captureDirectory }
}

const cli = cac('airi-io-trace')

cli.command('list', 'List local IO trace captures')
  .option('--directory <path>', 'Capture root (or AIRI_IO_TRACE_DIR)')
  .action(async (options: DirectoryOptions) => {
    process.stdout.write(`${JSON.stringify(await listIOTraceCaptures(capturesDirectory(options)), null, 2)}\n`)
  })

cli.command('inspect [capture]', 'Summarize a capture; defaults to latest')
  .option('--directory <path>', 'Capture root (or AIRI_IO_TRACE_DIR)')
  .action(async (captureId: string | undefined, options: DirectoryOptions) => {
    const resolved = await resolveCapture(captureId, options)
    process.stdout.write(`${JSON.stringify({
      active: resolved.active,
      captureDirectory: resolved.captureDirectory,
      manifest: resolved.capture.manifest,
      summary: summarizeIOTraceCapture(resolved.capture),
    }, null, 2)}\n`)
  })

cli.command('spans [capture]', 'Print matching spans as JSON Lines; defaults to latest')
  .option('--directory <path>', 'Capture root (or AIRI_IO_TRACE_DIR)')
  .option('--trace-id <id>', 'Only spans in one trace')
  .option('--name <name>', 'Only spans with this exact name')
  .option('--subsystem <name>', 'Only spans with this IO subsystem')
  .option('--errors', 'Only spans with OpenTelemetry error status')
  .action(async (captureId: string | undefined, options: SpanOptions) => {
    const { capture } = await resolveCapture(captureId, options)
    for (const item of capture.spans) {
      const span = item.span
      if (options.traceId && span.traceId !== options.traceId)
        continue
      if (options.name && span.name !== options.name)
        continue
      if (options.subsystem && span.attributes['ai.moeru.airi.io.subsystem'] !== options.subsystem)
        continue
      if (options.errors && span.status.code !== 2)
        continue
      process.stdout.write(`${JSON.stringify(item)}\n`)
    }
  })

cli.help()
cli.version('1.0.0')

try {
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}
catch (error) {
  process.stderr.write(`${errorMessageFrom(error) ?? 'Unknown IO trace CLI error'}\n`)
  process.exitCode = 1
}
