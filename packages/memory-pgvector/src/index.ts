import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'
import { Client } from '@proj-airi/server-sdk'
import { runUntilSignal } from '@proj-airi/server-sdk/utils/node'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

async function main() {
  const client = new Client<{ connectionString: string }>({
    name: 'memory-pgvector',
  })

  client.onEvent('module:configure', (_event) => {
  })

  runUntilSignal()

  process.on('SIGINT', () => client.close())
  process.on('SIGTERM', () => client.close())
}

main()
