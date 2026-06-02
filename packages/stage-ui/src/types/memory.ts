/**
 * Long-term memory (LTM) domain types.
 *
 * A {@link MemoryRecord} is one durable fact AIRI remembers about the master / world /
 * relationship, embedded for semantic recall. Records are scoped per character (airi-card) and
 * user so each persona keeps its own memory of each user.
 */

/** Coarse category of a memory, used for prompting and lifecycle policy. */
export type MemoryType
  = | 'preference' // likes/dislikes, working style ("不喜欢被催")
    | 'fact' // stable fact about the user/world ("养了只猫叫煤球")
    | 'event' // a notable thing that happened ("今天发布了项目")
    | 'relationship' // relational/emotional ("把 AIRI 当朋友")
    | 'commitment' // a promise/plan ("说周末要一起看番")

/** Stable identity of the persona+user a memory belongs to. */
export interface MemoryScope {
  /** airi-card id (the persona). */
  character: string
  /** user id; `'local'` for the anonymous local user. */
  userId: string
}

/** One durable, embedded memory. */
export interface MemoryRecord extends MemoryScope {
  /** Stable unique id. */
  id: string
  /** The remembered fact, phrased so the persona can read it naturally. */
  text: string
  type: MemoryType
  /**
   * Dense embedding of {@link text}. Length is the embedding model's dimension (bge-m3 = 1024).
   * All records in one scope are assumed to share the same dimension as the query at search time.
   */
  embedding: number[]
  /** Reinforcement weight; bumped on recall and decayed over time. Higher = more important. */
  salience: number
  createdAt: number
  updatedAt: number
  /** Last time this memory surfaced in a recall; absent until first recalled. */
  lastRecalledAt?: number
  /** Chat session this memory was extracted from, when known. */
  sourceSessionId?: string
}

/** A memory returned by {@link MemoryStore.search}, with its cosine similarity to the query. */
export interface MemorySearchHit {
  record: MemoryRecord
  /** Cosine similarity in [-1, 1]; 1 = identical direction. */
  similarity: number
}

/** Parameters for a semantic recall. */
export interface MemorySearchQuery {
  /** Query embedding to match against (same dimension as stored records). */
  embedding: number[]
  /** Maximum number of hits to return, highest similarity first. */
  k: number
  /** Drop hits whose similarity is below this threshold. Defaults to no threshold. */
  minSimilarity?: number
}

/**
 * Storage-agnostic long-term memory port.
 *
 * Use when:
 * - Recall (read) or memory formation (write) needs durable, scoped vector memory
 *
 * Expects:
 * - Every record carries its {@link MemoryScope}; mutation/listing methods take the scope explicitly
 *
 * Returns:
 * - Implementations persist across restarts and are shared across windows; the IndexedDB
 *   implementation is the default, with DuckDB/pgvector reserved as future backends behind this port.
 */
export interface MemoryStore {
  /** Insert (or overwrite by id) a memory record. */
  insert: (record: MemoryRecord) => Promise<void>
  /** Fetch one record by id within a scope, or `null` if absent. */
  get: (scope: MemoryScope, id: string) => Promise<MemoryRecord | null>
  /** Top-k semantic search within a scope, ordered by descending similarity. */
  search: (scope: MemoryScope, query: MemorySearchQuery) => Promise<MemorySearchHit[]>
  /** Patch an existing record (e.g. bump salience / lastRecalledAt). No-op if absent. */
  update: (scope: MemoryScope, id: string, patch: Partial<Omit<MemoryRecord, 'id' | keyof MemoryScope>>) => Promise<void>
  /** Forget one memory. */
  delete: (scope: MemoryScope, id: string) => Promise<void>
  /** All records in a scope (used by the memory browser UI and by recall caches). */
  list: (scope: MemoryScope) => Promise<MemoryRecord[]>
  /** Number of records in a scope. */
  count: (scope: MemoryScope) => Promise<number>
  /** Forget every memory in a scope. */
  clear: (scope: MemoryScope) => Promise<void>
}
