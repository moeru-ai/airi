export interface WebSocketBaseEvent<T, D> {
  type: T
  data: D
}

// Thanks to:
//
// A little hack for creating extensible discriminated unions : r/typescript
// https://www.reddit.com/r/typescript/comments/1064ibt/a_little_hack_for_creating_extensible/
export interface WebSocketEvents {
  'module:announce': {
    name: string
  }
  'input:voice:discord:transcription': {
    text: string
    username: string
    userDisplayName: string
    userId: string
  }
}

export type WebSocketEvent = {
  [K in keyof WebSocketEvents]: WebSocketBaseEvent<K, WebSocketEvents[K]>;
}[keyof WebSocketEvents]
