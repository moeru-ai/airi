export interface LlmLogEntry {
  eventType: string
  id: number
  kind: LlmLogEntryKind
  metadata?: Record<string, unknown>
  sourceId: string
  sourceType: string
  tags: string[]
  text: string
  timestamp: number
  turnId: number
}

export type LlmLogEntryKind
  = 'feedback'
    | 'llm_attempt'
    | 'repl_error'
    | 'repl_result'
    | 'scheduler'
    | 'turn_input'

interface LlmLogQueryPatch {
  predicates?: Array<(entry: LlmLogEntry) => boolean>
  sliceLatest?: number
  sorter?: (a: LlmLogEntry, b: LlmLogEntry) => number
}

class LlmLogQuery {
  constructor(
    private readonly entries: readonly LlmLogEntry[],
    private readonly predicates: Array<(entry: LlmLogEntry) => boolean> = [],
    private readonly sorter?: (a: LlmLogEntry, b: LlmLogEntry) => number,
    private readonly sliceLatest?: number,
  ) {}

  public between(startTs: number, endTs: number): LlmLogQuery {
    return this.clone({
      predicates: [...this.predicates, entry => entry.timestamp >= startTs && entry.timestamp <= endTs],
    })
  }

  public count(): number {
    return this.list().length
  }

  public errors(): LlmLogQuery {
    return this.whereTag('error')
  }

  public first(): LlmLogEntry | null {
    return this.list()[0] ?? null
  }

  public latest(count: number): LlmLogQuery {
    return this.clone({
      sliceLatest: Math.max(1, Math.floor(count)),
      sorter: (a, b) => b.timestamp - a.timestamp,
    })
  }

  public list(): LlmLogEntry[] {
    let result = this.entries.filter(entry => this.predicates.every(predicate => predicate(entry)))
    if (this.sorter)
      result = [...result].sort(this.sorter)
    if (this.sliceLatest !== undefined)
      result = result.slice(0, this.sliceLatest)
    return result.map(entry => ({ ...entry, tags: [...entry.tags] }))
  }

  public textIncludes(fragment: string): LlmLogQuery {
    const needle = fragment.toLowerCase()
    return this.clone({
      predicates: [...this.predicates, entry => entry.text.toLowerCase().includes(needle)],
    })
  }

  public turns(): LlmLogQuery {
    return this.whereKind('turn_input')
  }

  public whereKind(kind: LlmLogEntryKind | LlmLogEntryKind[]): LlmLogQuery {
    const set = new Set(Array.isArray(kind) ? kind : [kind])
    return this.clone({
      predicates: [...this.predicates, entry => set.has(entry.kind)],
    })
  }

  public whereSource(sourceType: string, sourceId?: string): LlmLogQuery {
    return this.clone({
      predicates: [...this.predicates, (entry) => {
        if (entry.sourceType !== sourceType)
          return false
        if (sourceId !== undefined)
          return entry.sourceId === sourceId
        return true
      }],
    })
  }

  public whereTag(tag: string | string[]): LlmLogQuery {
    const set = new Set((Array.isArray(tag) ? tag : [tag]).map(item => item.toLowerCase()))
    return this.clone({
      predicates: [...this.predicates, entry => entry.tags.some(item => set.has(item.toLowerCase()))],
    })
  }

  private clone(patch: LlmLogQueryPatch): LlmLogQuery {
    return new LlmLogQuery(
      this.entries,
      patch.predicates ?? this.predicates,
      patch.sorter ?? this.sorter,
      patch.sliceLatest ?? this.sliceLatest,
    )
  }
}

export function createLlmLogRuntime(getEntries: () => readonly LlmLogEntry[]) {
  return {
    byId(id: number): LlmLogEntry | null {
      const item = getEntries().find(entry => entry.id === id)
      return item ? { ...item, tags: [...item.tags] } : null
    },
    get entries(): LlmLogEntry[] {
      return getEntries().map(entry => ({ ...entry, tags: [...entry.tags] }))
    },
    latest(count = 20): LlmLogEntry[] {
      return new LlmLogQuery(getEntries()).latest(count).list()
    },
    query(): LlmLogQuery {
      return new LlmLogQuery(getEntries())
    },
  }
}
