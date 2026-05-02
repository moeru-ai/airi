import { Room, RoomEvent } from '@livekit/rtc-node'
import { createLiveKitLogger } from '@proj-airi/visual-chat-observability'

import { generateAgentToken } from '../token'

const log = createLiveKitLogger()

export interface RoomConnectionOptions {
  livekitUrl: string
  apiKey: string
  apiSecret: string
  roomName: string
  agentName?: string
}

export interface RoomConnection {
  room: Room
  disconnect: () => Promise<void>
}

export async function connectAsAgent(opts: RoomConnectionOptions): Promise<RoomConnection> {
  const token = await generateAgentToken(
    opts.apiKey,
    opts.apiSecret,
    opts.roomName,
    opts.agentName,
  )

  const room = new Room()

  room.on(RoomEvent.ParticipantConnected, (p) => {
    log.withTag('room').log(`Participant connected: ${p.identity}`)
  })

  room.on(RoomEvent.ParticipantDisconnected, (p) => {
    log.withTag('room').log(`Participant disconnected: ${p.identity}`)
  })

  room.on(RoomEvent.Disconnected, (reason) => {
    log.withTag('room').warn(`Room disconnected: ${reason}`)
  })

  await room.connect(opts.livekitUrl, token, { autoSubscribe: true })
  log.withTag('room').log(`Connected to room: ${opts.roomName}`)

  const disconnect = async () => {
    await room.disconnect()
    log.withTag('room').log(`Disconnected from room: ${opts.roomName}`)
  }

  return { room, disconnect }
}
