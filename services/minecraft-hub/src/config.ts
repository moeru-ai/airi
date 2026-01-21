import { env } from 'node:process'

export type AuthType = 'offline' | 'mojang' | 'microsoft'

export interface HubConfig {
  version: string
  motd: string

  viewerListenHost: string
  viewerListenPort: number
  viewerOnlineMode: boolean
  viewerUsername?: string

  botListenHost: string
  botListenPort: number
  botOnlineMode: boolean
  botUsername: string

  upstreamHost: string
  upstreamPort: number
  upstreamAuth: AuthType
  upstreamUsername: string

  rewriteIdentity: boolean
  debugPackets: boolean
  dumpPackets: boolean
  dumpDir: string

  mirrorMovement: boolean
  mirrorActions: boolean
}

function getEnvVar<V extends string>(key: string, fallback: V): V {
  return (env[key] || fallback) as V
}

function getEnvNumber(key: string, fallback: number): number {
  return Number.parseInt(env[key] || String(fallback))
}

function getEnvBool(key: string, fallback: boolean): boolean {
  const value = env[key]
  if (value === undefined)
    return fallback
  return value.toLowerCase() === 'true' || value === '1'
}

export function loadConfig(): HubConfig {
  return {
    version: getEnvVar('HUB_VERSION', '1.20'),
    motd: getEnvVar('HUB_MOTD', 'AIRI Minecraft Hub'),

    viewerListenHost: getEnvVar('HUB_VIEWER_LISTEN_HOST', '0.0.0.0'),
    viewerListenPort: getEnvNumber('HUB_VIEWER_LISTEN_PORT', 25566),
    viewerOnlineMode: getEnvBool('HUB_VIEWER_ONLINE_MODE', true),
    viewerUsername: env.HUB_VIEWER_USERNAME,

    botListenHost: getEnvVar('HUB_BOT_LISTEN_HOST', '0.0.0.0'),
    botListenPort: getEnvNumber('HUB_BOT_LISTEN_PORT', 25567),
    botOnlineMode: getEnvBool('HUB_BOT_ONLINE_MODE', false),
    botUsername: getEnvVar('HUB_BOT_USERNAME', 'airi-bot-mineflayer'),

    upstreamHost: getEnvVar('HUB_UPSTREAM_HOST', 'localhost'),
    upstreamPort: getEnvNumber('HUB_UPSTREAM_PORT', 25565),
    upstreamAuth: getEnvVar('HUB_UPSTREAM_AUTH', 'offline') as AuthType,
    upstreamUsername: getEnvVar('HUB_UPSTREAM_USERNAME', 'airi-bot'),

    rewriteIdentity: getEnvBool('HUB_REWRITE_IDENTITY', false),
    debugPackets: getEnvBool('HUB_DEBUG_PACKETS', false),
    dumpPackets: getEnvBool('HUB_DUMP_PACKETS', false),
    dumpDir: getEnvVar('HUB_DUMP_DIR', './packet-dumps'),

    mirrorMovement: getEnvBool('HUB_MIRROR_MOVEMENT', true),
    mirrorActions: getEnvBool('HUB_MIRROR_ACTIONS', false),
  }
}
