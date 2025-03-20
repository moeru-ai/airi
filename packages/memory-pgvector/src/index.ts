import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'
import { Client } from '@proj-airi/server-sdk'

import { runUntilSignal } from './utils/process'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

async function main() {
  const _client = new Client<{ connectionString: string }>({ name: 'memory-pgvector' })

  runUntilSignal()
}

main()
