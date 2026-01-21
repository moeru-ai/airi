import type { Buffer } from 'node:buffer'

import type { HubConfig } from './config'

import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { createClient, createServer } from 'minecraft-protocol'

import { useLogger } from './logger'

type ProtocolClient = any

type HubRole = 'bot' | 'viewer'

interface HubSession {
  role: HubRole
  username: string
  downstream: ProtocolClient
  readyForPlay: boolean
}

const MOVEMENT_PACKETS = new Set([
  'position',
  'position_look',
  'look',
  'move',
  'vehicle_move',
])

const ACTION_PACKETS = new Set([
  'arm_animation',
  'block_dig',
  'block_place',
  'use_item',
  'use_entity',
  'held_item_slot',
  'player_command',
  'entity_action',
])

export interface HubHandle {
  close: () => Promise<void>
}

function rewriteUuidArray(uuids: string[], targetUuid: string, replacementUuid: string) {
  return uuids.map(uuid => (uuid === targetUuid ? replacementUuid : uuid))
}

function rewritePacketForSession(name: string, data: any, session: HubSession, targetUsername?: string, targetUuid?: string) {
  if (!targetUuid || !session.downstream?.uuid)
    return data

  const replacementUuid = session.downstream.uuid
  const replacementName = session.username

  if (targetUuid === replacementUuid && (!targetUsername || targetUsername === replacementName))
    return data

  if (name === 'player_info' && Array.isArray(data.data)) {
    return {
      ...data,
      data: data.data.map((entry: any) => {
        if (entry.uuid !== targetUuid)
          return entry
        return {
          ...entry,
          uuid: replacementUuid,
          name: targetUsername && entry.name === targetUsername ? replacementName : entry.name,
        }
      }),
    }
  }

  if (name === 'player_info_update' && Array.isArray(data.data)) {
    return {
      ...data,
      data: data.data.map((entry: any) => {
        if (entry.uuid !== targetUuid)
          return entry
        return {
          ...entry,
          uuid: replacementUuid,
          name: targetUsername && entry.name === targetUsername ? replacementName : entry.name,
        }
      }),
    }
  }

  if (name === 'player_remove') {
    if (Array.isArray(data.players))
      return { ...data, players: rewriteUuidArray(data.players, targetUuid, replacementUuid) }
    if (Array.isArray(data.uuids))
      return { ...data, uuids: rewriteUuidArray(data.uuids, targetUuid, replacementUuid) }
  }

  if ((name === 'named_entity_spawn' || name === 'spawn_player') && data.playerUUID) {
    if (data.playerUUID !== targetUuid)
      return data
    return { ...data, playerUUID: replacementUuid }
  }

  if (typeof data === 'object' && data !== null && data.uuid === targetUuid)
    return { ...data, uuid: replacementUuid }

  return data
}

export async function startHub(config: HubConfig): Promise<HubHandle> {
  const logger = useLogger('minecraft-hub')

  const sessions = new Set<HubSession>()
  const configPacketBuffer: Array<{ buffer: Buffer, name: string, compressionThreshold?: number }> = []
  const playPacketBuffer: Array<{ name: string, data: any }> = []
  let configCompleted = false
  let configCompressionThreshold: number | null = null
  let initialDispatchDone = false
  let rawDumpStream: NodeJS.WritableStream | null = null

  if (config.dumpPackets) {
    mkdirSync(config.dumpDir, { recursive: true })
    const filename = `hub-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    const path = join(config.dumpDir, filename)
    rawDumpStream = createWriteStream(path, { flags: 'a' })
    logger.withFields({ path }).log('Packet dump enabled')
  }

  const dumpRaw = (direction: string, meta: { name: string, state: string }, buffer: Buffer) => {
    if (!rawDumpStream)
      return
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      direction,
      state: meta.state,
      name: meta.name,
      size: buffer.length,
      hex: buffer.toString('hex'),
    })
    rawDumpStream.write(`${line}\n`)
  }

  const mirrorToViewers = (name: string, data: unknown) => {
    for (const session of sessions) {
      if (session.role !== 'viewer')
        continue
      if (!session.readyForPlay)
        continue
      try {
        session.downstream.write(name, data as never)
      }
      catch (error) {
        logger.withFields({ packet: name, viewer: session.username }).errorWithError('Failed to mirror packet to viewer', error as Error)
      }
    }
  }

  const hasRole = (role: HubRole) => {
    for (const session of sessions) {
      if (session.role === role)
        return true
    }
    return false
  }

  const canDispatchInitialPackets = () => configCompleted && hasRole('viewer') && hasRole('bot') && !initialDispatchDone

  const dispatchInitialPackets = () => {
    if (!canDispatchInitialPackets())
      return

    for (const session of sessions) {
      session.downstream.state = 'configuration'
      for (const packet of configPacketBuffer) {
        session.downstream.writeRaw(packet.buffer)
        if (packet.name === 'set_compression' && typeof packet.compressionThreshold === 'number')
          session.downstream.compressionThreshold = packet.compressionThreshold
        if (config.dumpPackets)
          dumpRaw(`hub->downstream:${session.role}`, { name: packet.name, state: 'configuration' }, packet.buffer)
      }
      session.downstream.state = 'play'
      session.readyForPlay = true
    }

    for (const packet of playPacketBuffer) {
      for (const session of sessions) {
        if (!session.readyForPlay)
          continue
        try {
          const payload = config.rewriteIdentity
            ? rewritePacketForSession(packet.name, packet.data, session, targetIdentity.username, targetIdentity.uuid)
            : packet.data
          session.downstream.write(packet.name, payload)
        }
        catch (error) {
          logger.withFields({ packet: packet.name, role: session.role }).errorWithError('Failed to replay packet to downstream', error as Error)
        }
      }
    }

    playPacketBuffer.length = 0
    initialDispatchDone = true
  }

  const target = createClient({
    host: config.upstreamHost,
    port: config.upstreamPort,
    username: config.upstreamUsername,
    auth: config.upstreamAuth === 'offline' ? undefined : config.upstreamAuth,
    version: config.version,
  })

  const targetIdentity = {
    username: config.upstreamUsername,
    uuid: '',
  }

  target.on('raw', (buffer: Buffer, meta: { name: string, state: string }) => {
    if (config.debugPackets)
      logger.withFields({ direction: 'target->hub', state: meta.state, name: meta.name, size: buffer.length }).log('Raw packet')
    if (config.dumpPackets)
      dumpRaw('target->hub', meta, buffer)
    if (meta.state !== 'configuration' && (meta.state !== 'play' || config.rewriteIdentity))
      return
    if (meta.state === 'configuration') {
      configPacketBuffer.push({ buffer, name: meta.name, compressionThreshold: configCompressionThreshold ?? undefined })
    }
  })

  target.on('packet', (data: any, meta: { name: string, state: string }) => {
    if (config.debugPackets)
      logger.withFields({ direction: 'target->hub', state: meta.state, name: meta.name }).log('Decoded packet')
    if (meta.state === 'configuration' && meta.name === 'set_compression' && typeof data.threshold === 'number')
      configCompressionThreshold = data.threshold

    if (meta.name === 'player_info' && Array.isArray(data.data)) {
      const hubEntry = data.data.find((entry: any) => entry.name === config.upstreamUsername)
      if (hubEntry?.uuid)
        targetIdentity.uuid = hubEntry.uuid
    }

    if (!configCompleted && meta.state === 'configuration' && meta.name === 'finish_configuration') {
      configCompleted = true
      dispatchInitialPackets()
    }

    if (meta.state === 'play') {
      if (!initialDispatchDone) {
        playPacketBuffer.push({ name: meta.name, data })
        return
      }

      for (const session of sessions) {
        if (!session.readyForPlay)
          continue
        try {
          if (config.debugPackets)
            logger.withFields({ direction: 'hub->downstream', state: meta.state, name: meta.name, role: session.role }).log('Decoded forward')
          const payload = config.rewriteIdentity
            ? rewritePacketForSession(meta.name, data, session, targetIdentity.username, targetIdentity.uuid)
            : data
          session.downstream.write(meta.name, payload)
        }
        catch (error) {
          logger.withFields({ packet: meta.name, role: session.role }).errorWithError('Failed to forward packet to downstream', error as Error)
        }
      }
    }
  })

  target.on('end', () => {
    for (const session of sessions) {
      if (!session.downstream.ended)
        session.downstream.end('target_end')
    }
  })

  target.on('error', error => logger.errorWithError('Target server error', error))

  const createListener = (role: HubRole, host: string, port: number, onlineMode: boolean) => {
    const server = createServer({
      host,
      port,
      'version': config.version,
      'motd': config.motd,
      'maxPlayers': 10,
      'online-mode': onlineMode,
    })

    server.on('login', (downstream: ProtocolClient) => {
      const isViewer = role === 'viewer'
      const expectedViewer = config.viewerUsername || config.upstreamUsername

      if (isViewer && expectedViewer && downstream.username !== expectedViewer) {
        logger.withFields({ username: downstream.username }).error('Rejected viewer: username mismatch')
        downstream.end('viewer_username_mismatch')
        return
      }

      if (!isViewer && downstream.username !== config.botUsername) {
        logger.withFields({ username: downstream.username }).error('Rejected bot: username mismatch')
        downstream.end('bot_username_mismatch')
        return
      }

      const session: HubSession = { role, username: downstream.username, downstream, readyForPlay: false }
      sessions.add(session)

      logger.withFields({ role, username: downstream.username }).log('Hub client connected')

      downstream.state = 'configuration'
      if (configCompleted && initialDispatchDone) {
        for (const packet of configPacketBuffer) {
          downstream.writeRaw(packet.buffer)
          if (packet.name === 'set_compression' && typeof packet.compressionThreshold === 'number')
            downstream.compressionThreshold = packet.compressionThreshold
        }
        downstream.state = 'play'
        session.readyForPlay = true
      }

      dispatchInitialPackets()

      const relayDownstreamToTarget = (data: any, meta: { name: string, state: string }) => {
        if (meta.state !== 'play')
          return

        if (role === 'viewer')
          return

        try {
          if (role === 'bot' && (target as any).state === 'play')
            target.write(meta.name, data)
          if (config.debugPackets)
            logger.withFields({ direction: 'downstream->hub', state: meta.state, name: meta.name, role }).log('Decoded upstream send')
        }
        catch (error) {
          logger.withFields({ packet: meta.name, role }).errorWithError('Failed to forward packet to target server', error as Error)
        }

        if (role === 'bot' && config.mirrorMovement && MOVEMENT_PACKETS.has(meta.name))
          mirrorToViewers(meta.name, data)

        if (role === 'bot' && config.mirrorActions && ACTION_PACKETS.has(meta.name))
          mirrorToViewers(meta.name, data)
      }

      if (!config.rewriteIdentity && role === 'bot') {
        downstream.on('raw', (buffer: Buffer, meta: { name: string, state: string }) => {
          if (meta.state !== 'play')
            return
          if ((target as any).state === 'play')
            target.writeRaw(buffer)
          if (config.debugPackets)
            logger.withFields({ direction: 'downstream->hub', state: meta.state, name: meta.name, role, size: buffer.length }).log('Raw upstream send')
          if (config.dumpPackets)
            dumpRaw('downstream->hub', meta, buffer)
        })
      }
      else {
        downstream.on('packet', relayDownstreamToTarget)
      }

      const cleanup = (reason: string) => {
        sessions.delete(session)
        logger.withFields({ role, username: downstream.username, reason }).log('Closing hub session')
        if (!downstream.ended)
          downstream.end(reason)
      }

      downstream.on('end', () => cleanup('downstream_end'))
      downstream.on('error', error => logger.errorWithError('Downstream error', error))
    })

    server.on('error', error => logger.errorWithError('Hub server error', error as Error))

    return server
  }

  const viewerServer = createListener('viewer', config.viewerListenHost, config.viewerListenPort, config.viewerOnlineMode)
  const botServer = createListener('bot', config.botListenHost, config.botListenPort, config.botOnlineMode)

  logger.withFields({
    version: config.version,
    viewerListenHost: config.viewerListenHost,
    viewerListenPort: config.viewerListenPort,
    viewerOnlineMode: config.viewerOnlineMode,
    botListenHost: config.botListenHost,
    botListenPort: config.botListenPort,
    upstreamHost: config.upstreamHost,
    upstreamPort: config.upstreamPort,
  }).log('Minecraft hub started')

  return {
    close: async () => {
      for (const session of sessions) {
        if (!session.downstream.ended)
          session.downstream.end('hub_shutdown')
        if (session.target && !session.target.ended)
          session.target.end('hub_shutdown')
      }

      if (!target.ended)
        target.end('hub_shutdown')

      viewerServer.close()
      botServer.close()

      if (rawDumpStream)
        rawDumpStream.end()

      logger.log('Minecraft hub stopped')
    },
  }
}
