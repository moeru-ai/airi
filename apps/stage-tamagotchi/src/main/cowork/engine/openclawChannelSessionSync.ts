/**
 * OpenClaw Channel Session Sync
 *
 * Discovers and maps sessions created by OpenClaw channel extensions (e.g. Telegram)
 * to local Cowork sessions so that conversations are visible in the LobsterAI UI.
 */

import type { CoworkStore } from '../coworkStore'
import type { IMStore } from '../im/imStore'
import type { IMPlatform } from '../im/types'

const LOBSTERAI_SESSION_PREFIX = 'lobsterai:'
export const DEFAULT_MANAGED_AGENT_ID = 'main'

export interface ManagedSessionKey {
  agentId: string | null
  sessionId: string
}

export function buildManagedSessionKey(
  sessionId: string,
  agentId = DEFAULT_MANAGED_AGENT_ID,
): string {
  const normalizedSessionId = sessionId.trim()
  const normalizedAgentId = agentId.trim() || DEFAULT_MANAGED_AGENT_ID
  return `agent:${normalizedAgentId}:lobsterai:${normalizedSessionId}`
}

export function parseManagedSessionKey(sessionKey: string | undefined | null): ManagedSessionKey | null {
  const raw = (sessionKey ?? '').trim()
  if (!raw)
    return null

  if (raw.startsWith(LOBSTERAI_SESSION_PREFIX)) {
    const sessionId = raw.slice(LOBSTERAI_SESSION_PREFIX.length).trim()
    return sessionId ? { agentId: null, sessionId } : null
  }

  if (!raw.startsWith('agent:')) {
    return null
  }

  const parts = raw.split(':')
  if (parts.length < 4 || parts[0] !== 'agent' || parts[2] !== 'lobsterai') {
    return null
  }

  const agentId = parts[1]?.trim()
  const sessionId = parts.slice(3).join(':').trim()
  if (!agentId || !sessionId) {
    return null
  }

  return { agentId, sessionId }
}

export function isManagedSessionKey(sessionKey: string | undefined | null): boolean {
  return parseManagedSessionKey(sessionKey) !== null
}

/** Known OpenClaw channel prefixes mapped to IM platforms. */
export const CHANNEL_PLATFORM_MAP: Record<string, IMPlatform> = {
  'telegram': 'telegram',
  'discord': 'discord',
  'feishu': 'feishu',
  'dingtalk-connector': 'dingtalk',
  'qqbot': 'qq',
  'wecom': 'wecom',
  'wecom-openclaw-plugin': 'wecom',
  'moltbot-popo': 'popo',
}

/**
 * Parse a channel sessionKey into platform + conversationId.
 *  Supports three formats:
 *  - OpenClaw format: "agent:{agentId}:{platform}:{subtype}:{conversationId}"
 *  - JSON SessionContext format: "agent:{agentId}:openai-user:{jsonObject}"
 *    where jsonObject contains {"channel":"dingtalk-connector","accountid":"...","chattype":"...","peerid":"..."}
 *  - Legacy format:   "{platform}:{conversationId}"
 *  Exported for reuse by delivery target resolution.
 */
export function parseChannelSessionKey(sessionKey: string): { platform: IMPlatform, conversationId: string } | null {
  if (!sessionKey || isManagedSessionKey(sessionKey))
    return null

  // Handle OpenClaw format: agent:{agentId}:{platform}:{subtype}:{conversationId}
  // For HTTP-originating sessions (e.g. DingTalk plugin), the format is:
  //   agent:{agentId}:openai-user:{channel}:{conversationId}
  // where parts[2] is "openai-user" and the actual channel name is in parts[3].
  //
  // Since v0.7.5 dingtalk-connector, the format may also be JSON SessionContext:
  //   agent:{agentId}:openai-user:{"channel":"dingtalk-connector","accountid":"...","chattype":"...","peerid":"..."}
  if (sessionKey.startsWith('agent:')) {
    // Try JSON SessionContext format first:
    // Match "agent:{agentId}:{subtype}:{json}" where json starts with '{'
    const jsonIdx = sessionKey.indexOf(':{')
    if (jsonIdx > 0) {
      const jsonStr = sessionKey.slice(jsonIdx + 1)
      try {
        const ctx = JSON.parse(jsonStr)
        if (ctx && typeof ctx.channel === 'string') {
          const platform = CHANNEL_PLATFORM_MAP[ctx.channel]
          if (platform) {
            // Build a stable conversationId from the JSON context fields
            const conversationId = ctx.peerid || ctx.conversationId || ctx.accountid || jsonStr
            return { platform, conversationId }
          }
        }
      }
      catch {
        // Not valid JSON, fall through to colon-split parsing
      }
    }

    const parts = sessionKey.split(':')
    // Need at least: agent, agentId, platform, and one more segment
    if (parts.length >= 4) {
      let platform = CHANNEL_PLATFORM_MAP[parts[2]]
      if (platform) {
        const conversationId = parts.slice(3).join(':')
        if (conversationId)
          return { platform, conversationId }
      }
      // Fallback: parts[2] may be a session subtype (e.g. "openai-user");
      // check parts[3] for the actual channel name.
      if (!platform && parts.length >= 5) {
        platform = CHANNEL_PLATFORM_MAP[parts[3]]
        if (platform) {
          const conversationId = parts.slice(4).join(':')
          if (conversationId)
            return { platform, conversationId }
        }
      }
    }
    return null
  }

  // Legacy format: {platform}:{conversationId}
  const colonIndex = sessionKey.indexOf(':')
  if (colonIndex <= 0)
    return null

  const channelName = sessionKey.slice(0, colonIndex)
  const platform = CHANNEL_PLATFORM_MAP[channelName]
  if (!platform)
    return null

  const conversationId = sessionKey.slice(colonIndex + 1)
  if (!conversationId)
    return null

  return { platform, conversationId }
}

/** Match OpenClaw main agent session keys like "agent:main:main" or "agent:secondary:main". */
const MAIN_AGENT_SESSION_RE = /^agent:[^:]+:main$/

/** Match cron-isolated session keys generated by the OpenClaw gateway: "cron:{jobId}". */
const CRON_SESSION_KEY_RE = /^cron:[0-9a-f-]+$/i

export function isCronSessionKey(sessionKey: string): boolean {
  return CRON_SESSION_KEY_RE.test(sessionKey)
}

/** Map from platform (resolved) to title label. */
const CHANNEL_TITLE_PREFIX: Record<string, string> = {
  'telegram': '[TG]',
  'discord': '[Discord]',
  'feishu': '[飞书]',
  'dingtalk': '[钉钉]',
  'qq': '[QQ]',
  'wecom': '[企微]',
  'wecom-openclaw-plugin': '[企微]',
  'popo': '[POPO]',
}

export interface ChannelSessionSyncDeps {
  coworkStore: CoworkStore
  imStore: IMStore
  getDefaultCwd: () => string
}

export class OpenClawChannelSessionSync {
  private readonly coworkStore: CoworkStore
  private readonly imStore: IMStore
  private readonly getDefaultCwd: () => string

  /** In-memory cache: openclawSessionKey → local sessionId. */
  private readonly syncedSessionKeys = new Map<string, string>()

  /** Keys that have been tried and are not recognized — avoids repeated log noise. */
  private readonly rejectedKeys = new Set<string>()

  constructor(deps: ChannelSessionSyncDeps) {
    this.coworkStore = deps.coworkStore
    this.imStore = deps.imStore
    this.getDefaultCwd = deps.getDefaultCwd
  }

  /**
   * Try to resolve or create a local Cowork session for a channel-originated sessionKey.
   * Returns the local sessionId if the sessionKey belongs to a channel, or null if not.
   */
  resolveOrCreateSession(sessionKey: string): string | null {
    console.log('[ChannelSessionSync] resolveOrCreateSession called with key:', sessionKey)

    // 1. Skip LobsterAI-originated sessions
    if (isManagedSessionKey(sessionKey)) {
      console.log('[ChannelSessionSync] skipped: LobsterAI-originated session')
      return null
    }

    // 2. Check in-memory cache
    const cached = this.syncedSessionKeys.get(sessionKey)
    if (cached) {
      return cached
    }

    // 2b. Skip keys already known to be non-channel
    if (this.rejectedKeys.has(sessionKey)) {
      return null
    }

    // 3. Parse channel info
    const parsed = parseChannelSessionKey(sessionKey)
    if (!parsed) {
      console.log('[ChannelSessionSync] parse failed: not a recognized channel key:', sessionKey)
      this.rejectedKeys.add(sessionKey)
      return null
    }
    console.log('[ChannelSessionSync] parsed: platform=', parsed.platform, 'conversationId=', parsed.conversationId)

    // 4. Check persistent mapping in im_session_mappings
    const existingMapping = this.imStore.getSessionMapping(parsed.conversationId, parsed.platform)
    console.log('[ChannelSessionSync] existing mapping:', existingMapping ? `coworkSessionId=${existingMapping.coworkSessionId}` : 'none')
    if (existingMapping) {
      // Verify the Cowork session still exists
      const session = this.coworkStore.getSession(existingMapping.coworkSessionId)
      if (session) {
        console.log('[ChannelSessionSync] existing cowork session found, reusing:', existingMapping.coworkSessionId)
        this.syncedSessionKeys.set(sessionKey, existingMapping.coworkSessionId)
        this.imStore.updateSessionLastActive(parsed.conversationId, parsed.platform)
        return existingMapping.coworkSessionId
      }
      // Session was deleted, remove stale mapping
      console.log('[ChannelSessionSync] cowork session deleted, removing stale mapping')
      this.imStore.deleteSessionMapping(parsed.conversationId, parsed.platform)
    }

    // 5. Create new Cowork session
    const titlePrefix = CHANNEL_TITLE_PREFIX[parsed.platform] || `[${parsed.platform}]`
    // For conversationIds that look like email addresses (e.g. POPO),
    // use the local part before '@' as the display name.
    const displayId = parsed.conversationId.includes('@')
      ? parsed.conversationId.split('@')[0]
      : parsed.conversationId
    const shortId = displayId.length > 12
      ? displayId.slice(-12)
      : displayId
    const title = `${titlePrefix} ${shortId}`
    const cwd = this.getDefaultCwd()
    console.log('[ChannelSessionSync] creating new cowork session: title=', title, 'cwd=', cwd)

    const session = this.coworkStore.createSession(title, cwd, '', 'local')
    console.log(
      `[ChannelSessionSync] Created session for ${parsed.platform} conversation ${parsed.conversationId}: ${session.id}`,
    )

    // 6. Persist mapping
    this.imStore.createSessionMapping(parsed.conversationId, parsed.platform, session.id)
    console.log('[ChannelSessionSync] persisted mapping: conversationId=', parsed.conversationId, '→ sessionId=', session.id)

    // 7. Cache
    this.syncedSessionKeys.set(sessionKey, session.id)

    return session.id
  }

  /**
   * Try to resolve (but NOT create) a local Cowork session for a channel sessionKey.
   * Used by polling to avoid creating empty sessions when no new messages have arrived.
   * Returns the local sessionId if found, or null if not mapped.
   */
  resolveSession(sessionKey: string): string | null {
    if (isManagedSessionKey(sessionKey))
      return null

    // Check in-memory cache
    const cached = this.syncedSessionKeys.get(sessionKey)
    if (cached)
      return cached

    if (this.rejectedKeys.has(sessionKey))
      return null

    // Parse channel info
    const parsed = parseChannelSessionKey(sessionKey)
    if (!parsed) {
      this.rejectedKeys.add(sessionKey)
      return null
    }

    // Check persistent mapping
    const existingMapping = this.imStore.getSessionMapping(parsed.conversationId, parsed.platform)
    if (existingMapping) {
      const session = this.coworkStore.getSession(existingMapping.coworkSessionId)
      if (session) {
        this.syncedSessionKeys.set(sessionKey, existingMapping.coworkSessionId)
        return existingMapping.coworkSessionId
      }
      // Stale mapping, clean up
      this.imStore.deleteSessionMapping(parsed.conversationId, parsed.platform)
    }

    return null
  }

  /** Check whether a sessionKey belongs to a recognized channel, main agent, or cron session. */
  isChannelSessionKey(sessionKey: string): boolean {
    if (!sessionKey || isManagedSessionKey(sessionKey))
      return false
    if (parseChannelSessionKey(sessionKey) !== null)
      return true
    if (MAIN_AGENT_SESSION_RE.test(sessionKey))
      return true
    if (isCronSessionKey(sessionKey))
      return true
    return false
  }

  /**
   * Resolve or create a local Cowork session for the OpenClaw main agent session
   * (e.g. "agent:main:main"). This handles events that flow through the main session
   * rather than per-channel sessions.
   */
  resolveOrCreateMainAgentSession(sessionKey: string): string | null {
    if (isManagedSessionKey(sessionKey))
      return null
    if (!MAIN_AGENT_SESSION_RE.test(sessionKey))
      return null

    const cached = this.syncedSessionKeys.get(sessionKey)
    if (cached) {
      return cached
    }

    const cwd = this.getDefaultCwd()
    console.log('[ChannelSessionSync] creating main agent session: key=', sessionKey, 'cwd=', cwd)
    const session = this.coworkStore.createSession('[OpenClaw]', cwd, '', 'local')
    console.log('[ChannelSessionSync] created main agent session:', session.id)

    this.syncedSessionKeys.set(sessionKey, session.id)
    return session.id
  }

  /**
   * Resolve or create a local Cowork session for an OpenClaw cron-isolated session key
   * (format: "cron:{jobId}"). Each cron job gets one persistent local session that is
   * reused across runs, keeping the full run history in a single conversation.
   */
  resolveOrCreateCronSession(sessionKey: string): string | null {
    if (!isCronSessionKey(sessionKey))
      return null

    const cached = this.syncedSessionKeys.get(sessionKey)
    if (cached)
      return cached

    const jobId = sessionKey.slice('cron:'.length)
    const shortId = jobId.length > 8 ? jobId.slice(0, 8) : jobId
    const cwd = this.getDefaultCwd()
    console.log('[ChannelSessionSync] creating cron session: key=', sessionKey, 'cwd=', cwd)
    const session = this.coworkStore.createSession(`[Cron] ${shortId}`, cwd, '', 'local')
    console.log('[ChannelSessionSync] created cron session:', session.id)

    this.syncedSessionKeys.set(sessionKey, session.id)
    return session.id
  }

  clearCache(): void {
    this.syncedSessionKeys.clear()
    this.rejectedKeys.clear()
  }

  /**
   * Purge in-memory cache entries for a deleted session so that
   * new messages with the same sessionKey can create a fresh session.
   */
  onSessionDeleted(sessionId: string): void {
    for (const [key, id] of this.syncedSessionKeys.entries()) {
      if (id === sessionId) {
        this.syncedSessionKeys.delete(key)
        // Also remove from rejectedKeys in case it was previously rejected,
        // so that re-discovery can succeed.
        this.rejectedKeys.delete(key)
      }
    }
  }
}
