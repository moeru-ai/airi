export type LlmLogEntryKind
  = 'turn_input'
    | 'llm_attempt'
    | 'repl_result'
    | 'repl_error'
    | 'scheduler'
    | 'feedback'

export interface LlmLogEntry {
  id: number
  turnId: number
  kind: LlmLogEntryKind
  timestamp: number
  eventType: string
  sourceType: string
  sourceId: string
  tags: string[]
  text: string
  metadata?: Record<string, unknown>
}

interface LlmLogQueryPatch {
  predicates?: Array<(entry: LlmLogEntry) => boolean>
  sorter?: (a: LlmLogEntry, b: LlmLogEntry) => number
  sliceLatest?: number
}

class LlmLogQuery {
  constructor(
    private readonly entries: readonly LlmLogEntry[],
    private readonly predicates: Array<(entry: LlmLogEntry) => boolean> = [],
    private readonly sorter?: (a: LlmLogEntry, b: LlmLogEntry) => number,
    private readonly sliceLatest?: number,
  ) {}

  public whereKind(kind: LlmLogEntryKind | LlmLogEntryKind[]): LlmLogQuery {
    const set = new Set(Array.isArray(kind) ? kind : [kind])
    return this.clone({
      predicates: [...this.predicates, entry => set.has(entry.kind)],
    })
  }

  public whereTag(tag: string | string[]): LlmLogQuery {
    const set = new Set((Array.isArray(tag) ? tag : [tag]).map(item => item.toLowerCase()))
    return this.clone({
      predicates: [...this.predicates, entry => entry.tags.some(item => set.has(item.toLowerCase()))],
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

  public errors(): LlmLogQuery {
    return this.whereTag('error')
  }

  public turns(): LlmLogQuery {
    return this.whereKind('turn_input')
  }

  public between(startTs: number, endTs: number): LlmLogQuery {
    return this.clone({
      predicates: [...this.predicates, entry => entry.timestamp >= startTs && entry.timestamp <= endTs],
    })
  }

  public textIncludes(fragment: string): LlmLogQuery {
    const needle = fragment.toLowerCase()
    return this.clone({
      predicates: [...this.predicates, entry => entry.text.toLowerCase().includes(needle)],
    })
  }

  public latest(count: number): LlmLogQuery {
    return this.clone({
      sorter: (a, b) => b.timestamp - a.timestamp,
      sliceLatest: Math.max(1, Math.floor(count)),
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

  public first(): LlmLogEntry | null {
    return this.list()[0] ?? null
  }

  public count(): number {
    return this.list().length
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
    get entries(): LlmLogEntry[] {
      return getEntries().map(entry => ({ ...entry, tags: [...entry.tags] }))
    },
    query(): LlmLogQuery {
      return new LlmLogQuery(getEntries())
    },
    latest(count = 20): LlmLogEntry[] {
      return new LlmLogQuery(getEntries()).latest(count).list()
    },
    byId(id: number): LlmLogEntry | null {
      const item = getEntries().find(entry => entry.id === id)
      return item ? { ...item, tags: [...item.tags] } : null
    },
  }
}
