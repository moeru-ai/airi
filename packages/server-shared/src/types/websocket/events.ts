import type { AssistantMessage, Message, ToolMessage, UserMessage } from '@xsai/shared-chat'

export interface DiscordGuildMember {
  nickname: string
  displayName: string
  id: string
}

export interface Discord {
  guildMember?: DiscordGuildMember
  guildId?: string
  channelId?: string
}

export enum WebSocketEventSource {
  Server = 'proj-airi:server-runtime',
  StageWeb = 'proj-airi:stage-web',
  StageTamagotchi = 'proj-airi:stage-tamagotchi',
}

interface InputSource {
  'stage-web': boolean
  'stage-tamagotchi': boolean
  'discord': Discord
}

interface OutputSource {
  'gen-ai:chat': {
    input: UserMessage
    contexts: Record<string, ContextUpdate[]>
    composedMessage: Array<Message>
  }
}

export enum ContextUpdateStrategy {
  ReplaceSelf = 'replace-self',
  AppendSelf = 'append-self',
}

export interface ContextUpdateDestinationAll {
  all: true
}

export interface ContextUpdateDestinationList {
  include?: Array<string>
  exclude?: Array<string>
}

export type ContextUpdateDestinationFilter
  = | ContextUpdateDestinationAll
    | ContextUpdateDestinationList

export interface ContextUpdate<
  Metadata extends Record<string, any> = Record<string, unknown>,
  // eslint-disable-next-line ts/no-unnecessary-type-constraint
  Content extends any = undefined,
> {
  id: string
  /**
   * Can be the same if same update sends multiple time as attempts
   * and trials, (e.g. notified first but not ACKed, then retried).
   */
  contextId: string
  lane?: string
  ideas?: Array<string>
  hints?: Array<string>
  strategy: ContextUpdateStrategy
  text: string
  content?: Content
  destinations?: Array<string> | ContextUpdateDestinationFilter
  metadata?: Metadata
}

export interface WebSocketBaseEvent<T, D, S extends string = string> {
  type: T
  data: D
  source: WebSocketEventSource | S
}

export type WithInputSource<Source extends keyof InputSource> = {
  [S in Source]: InputSource[S]
}

export type WithOutputSource<Source extends keyof OutputSource> = {
  [S in Source]: OutputSource[S]
}

// Thanks to:
//
// A little hack for creating extensible discriminated unions : r/typescript
// https://www.reddit.com/r/typescript/comments/1064ibt/a_little_hack_for_creating_extensible/
export interface WebSocketEvents<C = undefined> {
  'error': {
    message: string
  }

  'module:authenticate': {
    token: string
  }
  'module:authenticated': {
    authenticated: boolean
  }
  'module:announce': {
    name: string
    possibleEvents: Array<(keyof WebSocketEvents<C>)>
  }
  'module:configure': {
    config: C
  }

  'ui:configure': {
    moduleName: string
    moduleIndex?: number
    config: C | Record<string, unknown>
  }

  'input:text': {
    text: string
  } & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>
  'input:text:voice': {
    transcription: string
  } & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>
  'input:voice': {
    audio: ArrayBuffer
  } & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>>

  'output:gen-ai:chat:tool-call': {
    toolCalls: ToolMessage[]
  } & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>
  'output:gen-ai:chat:message': {
    message: AssistantMessage
  } & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>
  'output:gen-ai:chat:complete': {
    message: AssistantMessage
    toolCalls: ToolMessage[]
    usage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
      source: 'provider-based' | 'estimate-based'
    }
  } & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai:chat'>>

  /**
   * Spark used for allowing agents in a network to raise an event toward the other destinations (e.g. character).
   *
   * DO:
   * - Use notify for episodic events (alarms/pings/reminders) with minimal payload.
   * - Use command for high-level intent; let sub-agents translate into their own state machines.
   * - Use emit for ack/progress/completion; include ids for tracing/dedupe.
   * - Route via destinations; keep payloads small; use context:update for richer ideas.
   * - Dedupe/log via id/eventId for observability.
   *
   * DOn't:
   * - Stream high-frequency telemetry here (keep a separate channel).
   * - Stuff large blobs into payload/contexts; prefer refs/summaries.
   * - Assume exactly-once; add retry/ack on critical paths. You may rely on id/eventId for dedupe.
   * - Allow untrusted agents to broadcast without auth/capability checks.
   *
   * Examples:
   * - Minecraft attack/death: kind=alarm, urgency=immediate (fast bubble-up).
   *   e.g., fromAgent='minecraft', headline='Under attack by witch', payload includes hp/location/gear.
   * - Cat bowl empty from HomeAssistant: kind=alarm, urgency=soon.
   * - IM/email "read now": kind=ping, urgency=immediate.
   * - Action Required email: kind=reminder, urgency=later.
   *
   * destinations controls routing (e.g. ['character'], ['character','minecraft-agent']).
   */
  'spark:notify': {
    id: string
    eventId: string
    lane?: string
    kind: 'alarm' | 'ping' | 'reminder'
    urgency: 'immediate' | 'soon' | 'later'
    headline: string
    note?: string
    payload?: Record<string, unknown>
    ttlMs?: number
    requiresAck?: boolean
    destinations: Array<string>
    metadata?: Record<string, unknown>
  }

  /**
   * Acknowledgement/progress/state for a spark or command (bidirectional).
   * Examples:
   * - Character: state=working, note="Seen it, responding".
   * - Sub-agent: state=done, note="Healed and safe".
   * - Sub-agent: state=blocked/dropped with note when it cannot comply.
   * - Minecraft: state=working, note="Pillared up; healing" in reply to a command.
   */
  'spark:emit': {
    id: string
    eventId?: string
    state: 'queued' | 'working' | 'done' | 'dropped' | 'blocked' | 'expired'
    note?: string
    destinations: Array<string>
    metadata?: Record<string, unknown>
  }

  /**
   * Character issues instructions or context to a sub-agent.
   * interrupt: force = hard preempt; soft = merge/queue.
   * Examples:
   * - Witch attack: interrupt=force, priority=critical, intent=action with options (aggressive/cautious).
   *   e.g., options to block/retreat vs push with shield/sword, with fallback steps.
   * - Prep plan: interrupt=soft, priority=high, intent=plan with steps/fallbacks.
   * - Contextual hints: intent=context with contextPatch ideas/hints.
   */
  'spark:command': {
    id: string
    eventId?: string
    parentEventId?: string
    commandId: string
    interrupt: 'force' | 'soft' | false
    priority: 'critical' | 'high' | 'normal' | 'low'
    intent: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
    ack?: string
    guidance?: {
      type: 'proposal' | 'instruction' | 'memory-recall'
      /**
       * Personas can be used to adjust the behavior of sub-agents.
       * For example, when using as NPC in games, or player in Minecraft,
       * the persona can help define the character's traits and decision-making style.
       *
       * Example:
       *  persona: {
       *    "bravery": "high",
       *    "cautiousness": "low",
       *    "friendliness": "medium"
       *  }
       */
      persona?: Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'>
      options: Array<{
        label: string
        steps: Array<string>
        rationale?: string
        possibleOutcome?: Array<string>
        risk?: 'high' | 'medium' | 'low' | 'none'
        fallback?: Array<string>
        triggers?: Array<string>
      }>
    }
    contexts?: Array<ContextUpdate>
    destinations: Array<string>
  }

  'context:update': ContextUpdate
}

export type WebSocketEvent<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: WebSocketBaseEvent<K, WebSocketEvents<C>[K]>;
}[keyof WebSocketEvents<C>]

export type WebSocketEventOptionalSource<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: Omit<WebSocketBaseEvent<K, WebSocketEvents<C>[K]>, 'source'> & Partial<Pick<WebSocketBaseEvent<K, WebSocketEvents<C>[K]>, 'source'>>;
}[keyof WebSocketEvents<C>]
