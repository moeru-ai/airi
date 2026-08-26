export interface PatternCard {
  code: string
  id: string
  intent: string
  pitfalls?: string[]
  steps: string[]
  tags: string[]
  title: string
  whenToUse: string[]
}

export interface PatternRuntime {
  find: (query: string, limit?: number) => PatternCard[]
  get: (id: string) => null | PatternCard
  ids: () => string[]
  list: (limit?: number) => PatternCard[]
}
