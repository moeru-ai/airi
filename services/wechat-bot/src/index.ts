import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { runAdapter } from './adapters/airi-adapter'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

const log = useLogg('WeChatBot').useGlobalConfig()

runAdapter().catch((error) => {
  log.withError(error as Error).error('WeChat adapter failed to start')
  process.exit(1)
})
