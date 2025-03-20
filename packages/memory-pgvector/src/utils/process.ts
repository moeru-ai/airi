import process from 'node:process'
import { useLogg } from '@guiiai/logg'

const logger = useLogg('process').useGlobalConfig()

let running = true

function killProcess() {
  running = false
}

process.on('SIGTERM', () => {
  logger.log('SIGTERM received')
  killProcess()
})
process.on('SIGINT', () => {
  logger.log('SIGINT received')
  killProcess()
})
process.on('uncaughtException', (e) => {
  logger.withError(e).error('uncaught exception')
  killProcess()
})

export function runUntilSignal() {
  setTimeout(() => {
    if (running)
      runUntilSignal()
  }, 10)
}
