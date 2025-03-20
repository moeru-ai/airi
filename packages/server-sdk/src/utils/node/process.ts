import process from 'node:process'

let running = true

function killProcess() {
  running = false
}

process.on('SIGTERM', () => {
  killProcess()
})
process.on('SIGINT', () => {
  killProcess()
})
process.on('uncaughtException', (e) => {
  console.error(e)
  killProcess()
})

export function runUntilSignal() {
  setTimeout(() => {
    if (running)
      runUntilSignal()
  }, 10)
}
