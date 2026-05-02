import { AccessToken } from 'livekit-server-sdk'

export interface TokenOptions {
  apiKey: string
  apiSecret: string
  roomName: string
  participantName: string
  participantIdentity: string
  ttl?: number // seconds, default 3600
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
  hidden?: boolean
}

export async function generateToken(opts: TokenOptions): Promise<string> {
  const at = new AccessToken(opts.apiKey, opts.apiSecret, {
    identity: opts.participantIdentity,
    name: opts.participantName,
    ttl: opts.ttl ?? 3600,
  })

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: opts.canPublish ?? true,
    canSubscribe: opts.canSubscribe ?? true,
    canPublishData: opts.canPublishData ?? true,
    hidden: opts.hidden ?? false,
  })

  return await at.toJwt()
}

export async function generateAgentToken(
  apiKey: string,
  apiSecret: string,
  roomName: string,
  agentName: string = 'airi-agent',
): Promise<string> {
  return generateToken({
    apiKey,
    apiSecret,
    roomName,
    participantName: agentName,
    participantIdentity: `agent_${agentName}`,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    hidden: true,
  })
}
