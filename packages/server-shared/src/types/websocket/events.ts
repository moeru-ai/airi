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

interface InputSource {
  browser: string
  discord: Discord
}

export interface WebSocketBaseEvent<T, D> {
  type: T
  data: D
}

export type WithInputSource<Source extends keyof InputSource> = {
  [S in Source]: InputSource[S]
}

// Thanks to:
//
// A little hack for creating extensible discriminated unions : r/typescript
// https://www.reddit.com/r/typescript/comments/1064ibt/a_little_hack_for_creating_extensible/
export interface WebSocketEvents {
  'module:announce': {
    name: string
    possibleEvents: Array<(keyof WebSocketEvents)>
  }
  'input:text': {
    text: string
  } & Partial<WithInputSource<'browser' | 'discord'>>
  'input:text:voice': {
    transcription: string
  } & Partial<WithInputSource<'browser' | 'discord'>>
  'input:voice': {
    audio: ArrayBuffer
  } & Partial<WithInputSource<'browser' | 'discord'>>
}

export type WebSocketEvent = {
  [K in keyof WebSocketEvents]: WebSocketBaseEvent<K, WebSocketEvents[K]>;
}[keyof WebSocketEvents]
