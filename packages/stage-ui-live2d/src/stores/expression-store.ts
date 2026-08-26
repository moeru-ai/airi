import { defineStore } from 'pinia'
import { ref } from 'vue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpressionBlendMode = 'Add' | 'Multiply' | 'Overwrite'

/**
 * A single expression parameter entry tracked by the store.
 *
 * Each entry maps to a Live2D parameter that is controlled through the
 * expression system (either via exp3 files or direct parameter access).
 */
export interface ExpressionEntry {
  /** How this value is applied on top of the base value. */
  blend: ExpressionBlendMode
  /** Runtime value that will be applied every frame. */
  currentValue: number
  /** Application-level default (may be overridden by the user via saveDefaults). */
  defaultValue: number
  /** Original default baked into the moc3 / exp3 file. */
  modelDefault: number
  /** Human-readable name (Expression name or raw parameter ID). */
  name: string
  /** Live2D parameter ID (e.g. "ParamWatermarkOFF"). */
  parameterId: string
  /** Active auto-reset timer handle, if any. */
  resetTimer?: ReturnType<typeof setTimeout>
  /**
   * The exp3-specified target value for this parameter (e.g. -1, 1, 10).
   * Used by toggle to know what value to set when activating.
   * For parameters referenced by multiple groups, this stores the first
   * non-zero value encountered.
   */
  targetValue: number
}

/**
 * Describes a named expression group loaded from model3.json / exp3.json.
 *
 * One expression group can contain multiple parameter entries (e.g. "Cry"
 * may set both "ParamTear" and "ParamEyeWet").
 */
export interface ExpressionGroupDefinition {
  /** Expression name as declared in model3.json Expressions[].Name. */
  name: string
  /** Parameter entries that belong to this expression group. */
  parameters: {
    blend: ExpressionBlendMode
    parameterId: string
    value: number
  }[]
}

/** Serialisable snapshot returned to the LLM. */
export interface ExpressionState {
  active: boolean
  autoResetAt?: number
  default: number
  name: string
  value: number
}

/** Unified tool result envelope. */
export interface ExpressionToolResult {
  available?: string[]
  error?: string
  state?: ExpressionState | ExpressionState[]
  success: boolean
}

// ---------------------------------------------------------------------------
// Persistence helpers  (localStorage – no extra dependency needed)
// ---------------------------------------------------------------------------

function loadPersistedDefaults(modelId: string): null | Record<string, number> {
  try {
    const raw = localStorage.getItem(persistenceKey(modelId))
    if (!raw)
      return null
    return JSON.parse(raw) as Record<string, number>
  }
  catch {
    return null
  }
}

function persistenceKey(modelId: string): string {
  return `expression-defaults:${modelId}`
}

function savePersistedDefaults(modelId: string, defaults: Record<string, number>): void {
  try {
    localStorage.setItem(persistenceKey(modelId), JSON.stringify(defaults))
  }
  catch (err) {
    console.warn('[expression-store] Failed to persist defaults:', err)
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExpressionStore = defineStore('live2d-expressions', () => {
  // ---- state ---------------------------------------------------------------

  /** Map keyed by expression/parameter name -> entry. */
  const expressions = ref<Map<string, ExpressionEntry>>(new Map())

  /** Currently loaded model ID (used for persistence scoping). */
  const modelId = ref<string>('')

  /**
   * Named expression groups parsed from model3.json + exp3.json.
   * Keyed by expression name.
   */
  const expressionGroups = ref<Map<string, ExpressionGroupDefinition>>(new Map())

  /** LLM exposure mode: 'all' exposes everything, 'none' exposes nothing, 'custom' uses per-group map. */
  const llmMode = ref<'all' | 'custom' | 'none'>('none')

  /** Per-group LLM exposure flags (only used when llmMode === 'custom'). */
  const llmExposed = ref<Map<string, boolean>>(new Map())

  // ---- internal helpers ----------------------------------------------------

  function clearAllTimers() {
    for (const entry of expressions.value.values()) {
      if (entry.resetTimer != null) {
        clearTimeout(entry.resetTimer)
        entry.resetTimer = undefined
      }
    }
  }

  function toState(entry: ExpressionEntry): ExpressionState {
    return {
      active: entry.currentValue !== entry.defaultValue,
      autoResetAt: entry.resetTimer != null ? Date.now() : undefined,
      default: entry.defaultValue,
      name: entry.name,
      value: entry.currentValue,
    }
  }

  function allNames(): string[] {
    return Array.from(expressions.value.keys())
  }

  // ---- public API ----------------------------------------------------------

  /**
   * Register all expression entries parsed from the model.
   * Called by the expression-controller after parsing exp3 data.
   */
  function registerExpressions(
    id: string,
    groups: ExpressionGroupDefinition[],
    parameterEntries: ExpressionEntry[],
  ) {
    clearAllTimers()
    expressions.value = new Map()
    expressionGroups.value = new Map()
    modelId.value = id

    // Register expression groups
    for (const group of groups) {
      expressionGroups.value.set(group.name, group)
    }

    // Register individual parameter entries
    for (const entry of parameterEntries) {
      expressions.value.set(entry.name, { ...entry })
    }

    // Restore persisted defaults
    const persisted = loadPersistedDefaults(id)
    if (persisted) {
      for (const [name, defaultVal] of Object.entries(persisted)) {
        const entry = expressions.value.get(name)
        if (entry) {
          entry.defaultValue = defaultVal
          entry.currentValue = defaultVal
        }
      }
    }
  }

  /**
   * Resolve a name to either an expression group or a direct parameter entry.
   * Returns `'group'`, `'param'`, or `null`.
   */
  function resolve(name: string): null | { entry: ExpressionEntry, kind: 'param' } | { group: ExpressionGroupDefinition, kind: 'group' } {
    const group = expressionGroups.value.get(name)
    if (group)
      return { group, kind: 'group' }

    const entry = expressions.value.get(name)
    if (entry)
      return { entry, kind: 'param' }

    return null
  }

  /**
   * Set an expression or parameter value.
   */
  function set(name: string, value: boolean | number, duration?: number): ExpressionToolResult {
    const resolved = resolve(name)

    if (!resolved) {
      return {
        available: allNames(),
        error: `Expression or parameter "${name}" not found.`,
        success: false,
      }
    }

    const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : value

    if (resolved.kind === 'group') {
      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = expressions.value.get(param.parameterId)
        if (entry) {
          applyValue(entry, numericValue, duration)
          states.push(toState(entry))
        }
      }
      return { state: states, success: true }
    }

    // Direct parameter
    applyValue(resolved.entry, numericValue, duration)
    return { state: toState(resolved.entry), success: true }
  }

  /**
   * Get expression state.
   */
  function get(name?: string): ExpressionToolResult {
    if (!name) {
      // Return all
      const states: ExpressionState[] = []
      for (const entry of expressions.value.values()) {
        states.push(toState(entry))
      }
      return { state: states, success: true }
    }

    const resolved = resolve(name)
    if (!resolved) {
      return {
        available: allNames(),
        error: `Expression or parameter "${name}" not found.`,
        success: false,
      }
    }

    if (resolved.kind === 'group') {
      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = expressions.value.get(param.parameterId)
        if (entry)
          states.push(toState(entry))
      }
      return { state: states, success: true }
    }

    return { state: toState(resolved.entry), success: true }
  }

  /**
   * Toggle an expression (flip between default and non-default).
   */
  function toggle(name: string, duration?: number): ExpressionToolResult {
    const resolved = resolve(name)
    if (!resolved) {
      return {
        available: allNames(),
        error: `Expression or parameter "${name}" not found.`,
        success: false,
      }
    }

    if (resolved.kind === 'group') {
      // A group is "active" when at least one of its non-zero (activation)
      // params is currently set to the exp3 value.  Zero-valued params are
      // "reset" instructions and are excluded from the active check.
      const isActive = resolved.group.parameters.some((p) => {
        if (p.value === 0)
          return false
        const entry = expressions.value.get(p.parameterId)
        return entry && entry.currentValue === p.value
      })
      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = expressions.value.get(param.parameterId)
        if (entry) {
          const newValue = isActive ? entry.modelDefault : param.value
          applyValue(entry, newValue, duration)
          states.push(toState(entry))
        }
      }
      return { state: states, success: true }
    }

    // Direct parameter toggle: flip between modelDefault and exp3 target value
    const entry = resolved.entry
    const newValue = entry.currentValue !== entry.modelDefault ? entry.modelDefault : entry.targetValue
    applyValue(entry, newValue, duration)
    return { state: toState(entry), success: true }
  }

  /**
   * Save current values as defaults (persisted across restarts).
   */
  function saveDefaults(): ExpressionToolResult {
    if (!modelId.value) {
      return { error: 'No model loaded.', success: false }
    }

    const defaults: Record<string, number> = {}
    for (const [name, entry] of expressions.value) {
      entry.defaultValue = entry.currentValue
      defaults[name] = entry.currentValue
    }

    savePersistedDefaults(modelId.value, defaults)
    return { success: true }
  }

  /**
   * Reset all expressions to their default values.
   */
  function resetAll(): ExpressionToolResult {
    clearAllTimers()
    const states: ExpressionState[] = []
    for (const entry of expressions.value.values()) {
      entry.currentValue = entry.modelDefault
      states.push(toState(entry))
    }
    return { state: states, success: true }
  }

  /**
   * Full cleanup when a model is unloaded.
   */
  function dispose() {
    clearAllTimers()
    expressions.value = new Map()
    expressionGroups.value = new Map()
    llmMode.value = 'none'
    llmExposed.value = new Map()
    modelId.value = ''
  }

  // ---- LLM exposure --------------------------------------------------------

  function setLlmMode(mode: 'all' | 'custom' | 'none') {
    llmMode.value = mode
  }

  function setLlmExposed(name: string, value: boolean) {
    llmExposed.value.set(name, value)
  }

  /** Check if a specific expression group is exposed to LLM tools. */
  function isExposedToLlm(name: string): boolean {
    if (llmMode.value === 'all')
      return true
    if (llmMode.value === 'none')
      return false
    return llmExposed.value.get(name) ?? false
  }

  // ---- private -------------------------------------------------------------

  function applyValue(entry: ExpressionEntry, value: number, duration?: number) {
    // Cancel existing timer
    if (entry.resetTimer != null) {
      clearTimeout(entry.resetTimer)
      entry.resetTimer = undefined
    }

    entry.currentValue = value

    // Schedule auto-reset if duration > 0
    if (duration && duration > 0) {
      const resetTo = entry.defaultValue
      entry.resetTimer = setTimeout(() => {
        entry.currentValue = resetTo
        entry.resetTimer = undefined
      }, duration * 1000)
    }
  }

  return {
    dispose,
    expressionGroups,
    // State (read-only externally, but reactive)
    expressions,
    get,
    isExposedToLlm,

    llmExposed,
    llmMode,
    modelId,
    // Actions
    registerExpressions,
    resetAll,
    resolve,
    saveDefaults,
    set,
    setLlmExposed,
    setLlmMode,
    toggle,
  }
})
