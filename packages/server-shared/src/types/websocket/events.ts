import type { AssistantMessage, ToolMessage } from '@xsai/shared-chat'

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
  'stage-web': string
  'stage-tamagotchi': string
  'discord': Discord
}

interface OutputSource {
  'gen-ai-model-chat': string
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
  'output:gen-ai:chat:message': {
    messages: Array<AssistantMessage | ToolMessage>
  } & Partial<WithInputSource<'stage-web' | 'stage-tamagotchi' | 'discord'>> & Partial<WithOutputSource<'gen-ai-model-chat'>>
  'context:update': ContextUpdate
}

export type WebSocketEvent<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: WebSocketBaseEvent<K, WebSocketEvents<C>[K]>;
}[keyof WebSocketEvents<C>]

export type WebSocketEventOptionalSource<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: Omit<WebSocketBaseEvent<K, WebSocketEvents<C>[K]>, 'source'> & Partial<Pick<WebSocketBaseEvent<K, WebSocketEvents<C>[K]>, 'source'>>;
}[keyof WebSocketEvents<C>]
