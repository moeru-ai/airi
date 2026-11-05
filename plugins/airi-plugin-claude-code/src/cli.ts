import type { Buffer } from 'node:buffer'

import type { HookInput } from '@anthropic-ai/claude-code'

import { argv, exit, stdin } from 'node:process'

import { Format, LogLevel, LogLevelString, useLogg } from '@guiiai/logg'
import { Client } from '@proj-airi/server-sdk'
import { cac } from 'cac'

import { name, version } from '../package.json'

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
    // `--debug` keeps its optional value for existing hook configs. Every value shows debug logs.
    // It reads `cli.options`, because cac passes no `flags` to this action: `send` has no positional argument.
    else if (cli.options.debug) {
      logger = logger.withLogLevel(LogLevel.Debug)
      logger.withField('debug', cli.options.debug).debug('Debugging enabled')
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

  try {
    await cli.runMatchedCommand()
  }
  catch (error) {
    logger.withError(error).error('running failed')
    exit(1)
  }
}
