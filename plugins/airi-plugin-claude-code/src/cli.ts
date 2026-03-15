import type { Buffer } from 'node:buffer'

import type { HookInput } from '@anthropic-ai/claude-code'

import { argv, exit, stdin } from 'node:process'

import debug from 'debug'

import { Format, LogLevel, LogLevelString, useLogg } from '@guiiai/logg'
import { Client } from '@proj-airi/server-sdk'
import { cac } from 'cac'

import { name, version } from '../package.json'
import { resolveComma, toArray } from './utils/general'

interface Options {
  config?: string
  configLoader?: 'auto' | 'native' | 'unconfig'
  noConfig?: boolean
  debug?: boolean | string | string[]
  logLevel?: LogLevelString.Log | LogLevelString.Warning | LogLevelString.Error
  failOnWarn?: boolean
  env?: Record<string, string>
  quiet?: boolean
}

let logger = useLogg(name).withLogLevel(LogLevel.Log).withFormat(Format.Pretty)

const cli = cac('airi-plugin-claude-code-cli')
cli.help().version(version)

cli
  .command('send', 'Pass Claude Code hook event to Channel Server', { ignoreOptionDefaultValue: true, allowUnknownOptions: true })
  .option('-c, --config <filename>', 'Use a custom config file')
  .option('--config-loader <loader>', 'Config loader to use: auto, native, unconfig', { default: 'auto' })
  .option('--no-config', 'Disable config file')
  .option('--debug [feat]', 'Show debug logs')
  .option('-l, --logLevel <level>', 'Set log level: info, warn, error, silent')
  .option('--fail-on-warn', 'Fail on warnings', { default: true })
  .option('--env.* <value>', 'Define env variables')
  .option('--quiet', 'Suppress all logs')
  .action(async (_, flags: Options) => {
    if (flags?.quiet) {
      logger = logger.withLogLevel(-1 as LogLevel)
    }
    else {
      logger = logger.withLogLevelString(flags?.logLevel ?? LogLevelString.Log)
    }

    async function readStdin(): Promise<string> {
      const chunks: string[] = []
      for await (const chunk of stdin) {
        chunks.push((chunk as Buffer).toString('utf-8'))
      }

      return chunks.join('')
    }

    if (stdin.isTTY) {
      throw new Error('`send` doesn\'t work without stdin input, Claude Code hooks events are expected to be piped to this command.')
    }

    const stdinInput = await readStdin()
    if (!stdinInput.trim()) {
      throw new Error('`send` received empty stdin input, Claude Code hooks events are expected to be piped to this command.')
    }

    const hookEvent = JSON.parse(stdinInput) as HookInput

    if (hookEvent.hook_event_name === 'UserPromptSubmit') {
      const channelServer = new Client({ name: 'proj-airi:plugin-claude-code', autoConnect: false })
      await channelServer.connect()

      channelServer.send({ type: 'input:text', data: { text: hookEvent.prompt } })
    }
  })

export async function runCLI(): Promise<void> {
  cli.parse(argv, { run: false })

  if (cli.options.debug) {
    let namespace: string
    if (cli.options.debug === true) {
      namespace = `${name}:*`
    }
    else {
      // support debugging multiple flags with comma-separated list
      namespace = resolveComma(toArray(cli.options.debug))
        .map(v => `${name}:${v}`)
        .join(',')
    }

    const enabled = debug.disable()
    if (enabled)
      namespace += `,${enabled}`

    debug.enable(namespace)
    debug(`${name}:debug`)('Debugging enabled', namespace)
  }

  try {
    await cli.runMatchedCommand()
  }
  catch (error) {
    logger.withError(error).error('running failed')
    exit(1)
  }
}
