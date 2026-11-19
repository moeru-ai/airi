/** A set of wanted keys, or `'*'` for all keys. */
export type Demand<T> = ReadonlySet<T> | '*'

export interface DemandUnionOptions<T> {
  /** Receives the new union after each change of it. A `set` that keeps the union the same does not call it. */
  readonly onChange?: (union: Demand<T>) => void
}

const ALL = '*'

/**
 * The union of what each member wants, for example the tracks of all viewers.
 *
 * A producer reads the union to skip work that no member wants. One `'*'` member makes the union `'*'`.
 *
 * @example
 * const demand = new DemandUnion<string>({ onChange: union => source.setWanted(union) })
 * demand.set('viewer-1', ['audio.level'])
 * demand.set('viewer-2', '*') // onChange('*')
 * demand.delete('viewer-2') // onChange(Set { 'audio.level' })
 */
export class DemandUnion<T> {
  private readonly members = new Map<string, Demand<T>>()
  private current: Demand<T> = new Set()

  constructor(private readonly options: DemandUnionOptions<T> = {}) {}

  get union(): Demand<T> {
    return this.current
  }

  set(id: string, demand: Iterable<T> | '*'): void {
    this.members.set(id, demand === ALL ? ALL : new Set(demand))
    this.update()
  }

  delete(id: string): void {
    if (this.members.delete(id))
      this.update()
  }

  private update(): void {
    const next = this.compute()
    if (sameDemand(next, this.current))
      return
    this.current = next
    this.options.onChange?.(next)
  }

  private compute(): Demand<T> {
    const union = new Set<T>()
    for (const demand of this.members.values()) {
      if (demand === ALL)
        return ALL
      for (const key of demand)
        union.add(key)
    }
    return union
  }
}

function sameDemand<T>(a: Demand<T>, b: Demand<T>): boolean {
  if (a === ALL || b === ALL)
    return a === b
  if (a.size !== b.size)
    return false
  for (const key of a) {
    if (!b.has(key))
      return false
  }
  return true
}
