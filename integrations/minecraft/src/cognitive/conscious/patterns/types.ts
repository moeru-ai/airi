export interface PatternCard {
  id: string
  title: string
  intent: string
  whenToUse: string[]
  steps: string[]
  code: string
  tags: string[]
  pitfalls?: string[]
}

export interface PatternRuntime {
  get: (id: string) => PatternCard | null
  find: (query: string, limit?: number) => PatternCard[]
  ids: () => string[]
  list: (limit?: number) => PatternCard[]
}
