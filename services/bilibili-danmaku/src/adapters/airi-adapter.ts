import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { Client as ServerChannel, ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { KeepLiveWS } from 'bilibili-live-ws'

const log = useLogg('BilibiliDanmakuAdapter').useGlobalConfig()

export interface BilibiliDanmakuAdapterConfig {
  roomId: number
  airiToken?: string
  airiUrl?: string
}

interface DanmakuMessage {
  text: string
  userName: string
  uid: number
  medal?: {
    name: string
    level: number
  }
  timestamp: number
}

export class BilibiliDanmakuAdapter {
  private airiClient: ServerChannel
  private liveWs: KeepLiveWS | null = null
  private roomId: number

  constructor(config: BilibiliDanmakuAdapterConfig) {
    this.roomId = config.roomId

    this.airiClient = new ServerChannel({
      name: 'bilibili-danmaku',
      possibleEvents: [
        'input:text',
        'output:gen-ai:chat:message',
      ],
      token: config.airiToken || env.AIRI_TOKEN,
      url: config.airiUrl || env.AIRI_SERVER_URL,
    })
  }

  async start(): Promise<void> {
    log.log(`Starting Bilibili danmaku adapter for room ${this.roomId}...`)

    this.liveWs = new KeepLiveWS(this.roomId)

    this.liveWs.on('open', () => {
      log.log(`Connected to Bilibili live room ${this.roomId}`)
    })

    this.liveWs.on('live', () => {
      log.log(`Live connection established for room ${this.roomId}`)
    })

    this.liveWs.on('heartbeat', (online: number) => {
      log.log(`Room ${this.roomId} online: ${online}`)
    })

    this.liveWs.on('DANMU_MSG', (data: { info: unknown[] }) => {
      try {
        const danmaku = this.parseDanmaku(data)
        if (danmaku)
          this.handleDanmaku(danmaku)
      }
      catch (error) {
        log.withError(error as Error).error('Failed to parse danmaku')
      }
    })

    this.liveWs.on('error', (error: Error) => {
      log.withError(error).error('WebSocket error')
    })

    this.liveWs.on('close', () => {
      log.log('WebSocket closed, will auto-reconnect...')
    })

    log.log('Bilibili danmaku adapter started successfully')
  }

  stop(): void {
    if (this.liveWs) {
      this.liveWs.close()
      this.liveWs = null
    }
    log.log('Bilibili danmaku adapter stopped')
  }

  private parseDanmaku(data: { info: unknown[] }): DanmakuMessage | null {
    // DANMU_MSG info array structure:
    // info[1] = danmaku text
    // info[2] = [uid, username, ...]
    // info[3] = [medal_level, medal_name, ...] (fan medal)
    // info[9] = { ts: timestamp }
    const info = data.info
    if (!info || !Array.isArray(info))
      return null

    const text = info[1] as string
    if (!text || typeof text !== 'string')
      return null

    const userInfo = info[2] as unknown[]
    const uid = userInfo?.[0] as number ?? 0
    const userName = userInfo?.[1] as string ?? 'unknown'

    const medalInfo = info[3] as unknown[]
    const medal = medalInfo?.length
      ? {
          level: medalInfo[0] as number,
          name: medalInfo[1] as string,
        }
      : undefined

    const timestampInfo = info[9] as { ts?: number } | undefined
    const timestamp = timestampInfo?.ts ?? Math.floor(Date.now() / 1000)

    return { text, userName, uid, medal, timestamp }
  }

  private handleDanmaku(danmaku: DanmakuMessage): void {
    log.log(`[Danmaku] ${danmaku.userName}: ${danmaku.text}`)

    const sessionId = `bilibili-room-${this.roomId}`
    const medalTag = danmaku.medal
      ? ` [${danmaku.medal.name} Lv.${danmaku.medal.level}]`
      : ''

    const contextNotice = `Bilibili live room ${this.roomId} danmaku from user ${danmaku.userName}${medalTag}.`

    this.airiClient.send({
      type: 'input:text',
      data: {
        text: danmaku.text,
        textRaw: danmaku.text,
        overrides: {
          messagePrefix: `(From Bilibili viewer ${danmaku.userName}${medalTag}): `,
          sessionId,
        },
        contextUpdates: [{
          strategy: ContextUpdateStrategy.AppendSelf,
          text: contextNotice,
          content: contextNotice,
          metadata: {
            bilibili: {
              roomId: this.roomId,
              uid: danmaku.uid,
              userName: danmaku.userName,
              medal: danmaku.medal,
            },
          },
        }],
      },
    })
  }
}
