import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'

import { BilibiliDanmakuAdapter } from './adapters/airi-adapter'

const log = useLogg('bilibili-danmaku').useGlobalConfig()

async function main() {
  const roomId = env.BILIBILI_ROOM_ID
  if (!roomId) {
    log.error('BILIBILI_ROOM_ID environment variable is required')
    process.exit(1)
  }

  const adapter = new BilibiliDanmakuAdapter({
    roomId: Number.parseInt(roomId, 10),
    airiUrl: env.AIRI_SERVER_URL,
    airiToken: env.AIRI_TOKEN,
  })

  await adapter.start()

  process.on('SIGINT', () => {
    log.log('Shutting down...')
    adapter.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    log.log('Shutting down...')
    adapter.stop()
    process.exit(0)
  })
}

main().catch((error) => {
  log.error('Failed to start:', error)
  process.exit(1)
})
