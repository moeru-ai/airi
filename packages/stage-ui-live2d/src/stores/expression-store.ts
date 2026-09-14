import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

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
  /** Human-readable name (Expression name or raw parameter ID). */
  name: string
  /** Live2D parameter ID (e.g. "ParamWatermarkOFF"). */
  parameterId: string
  /** How this value is applied on top of the base value. */
  blend: ExpressionBlendMode
  /** Runtime value that will be applied every frame. */
  currentValue: number
  /** Application-level default (may be overridden by the user via saveDefaults). */
  defaultValue: number
  /** Original default baked into the moc3 / exp3 file. */
  modelDefault: number
  /**
   * The exp3-specified target value for this parameter (e.g. -1, 1, 10).
   * Used by toggle to know what value to set when activating.
   * For parameters referenced by multiple groups, this stores the first
   * non-zero value encountered.
   */
  targetValue: number
  /** Active auto-reset timer handle, if any. */
  resetTimer?: ReturnType<typeof setTimeout>
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
    parameterId: string
    blend: ExpressionBlendMode
    value: number
  }[]
}

/** Serialisable snapshot returned to the LLM. */
export interface ExpressionState {
  name: string
  value: number
  default: number
  active: boolean
  autoResetAt?: number
}

/** Unified tool result envelope. */
export interface ExpressionToolResult {
  success: boolean
  error?: string
  state?: ExpressionState | ExpressionState[]
  available?: string[]
}

/** Controls which Live2D expressions the model exposes to LLM tools. */
export type Live2DExpressionLlmMode = 'all' | 'none' | 'custom'

/** A serializable expression group used by model settings in another renderer. */
export interface Live2DExpressionSettingsGroupSnapshot {
  /** Expression name declared by the loaded model. */
  name: string
  /** Whether the owning renderer currently applies this expression. */
  active: boolean
  /** Whether custom LLM exposure includes this expression. */
  exposedToLlm: boolean
}

/** The serializable settings state owned by the renderer that loaded the Live2D model. */
export interface Live2DExpressionSettingsSnapshot {
  /** Expression groups discovered by the owning renderer. */
  groups: Live2DExpressionSettingsGroupSnapshot[]
  /** Current LLM exposure policy. */
  llmMode: Live2DExpressionLlmMode
}

/** A settings operation sent to the renderer that owns the Live2D model. */
export type Live2DExpressionSettingsCommand
  = | { type: 'toggle', name: string }
    | { type: 'set-llm-mode', mode: Live2DExpressionLlmMode }
    | { type: 'set-llm-exposed', name: string, exposed: boolean }
    | { type: 'save-defaults' }
    | { type: 'reset-all' }

// ---------------------------------------------------------------------------
// Persistence helpers  (localStorage – no extra dependency needed)
// ---------------------------------------------------------------------------

function persistenceKey(modelId: string): string {
  return `expression-defaults:${modelId}`
}

function loadPersistedDefaults(modelId: string): Record<string, number> | null {
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
  const llmMode = ref<Live2DExpressionLlmMode>('none')

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
      name: entry.name,
      value: entry.currentValue,
      default: entry.defaultValue,
      active: entry.currentValue !== entry.defaultValue,
      autoResetAt: entry.resetTimer != null ? Date.now() : undefined,
    }
  }

  function allNames(): string[] {
    return Array.from(expressions.value.keys())
  }

  function isGroupActive(group: ExpressionGroupDefinition): boolean {
    return group.parameters.some((parameter) => {
      if (parameter.value === 0)
        return false

      const entry = expressions.value.get(parameter.parameterId)
      return entry != null && entry.currentValue === parameter.value
    })
  }

  const settingsSnapshot = computed<Live2DExpressionSettingsSnapshot>(() => ({
    groups: Array.from(expressionGroups.value.values(), group => ({
      name: group.name,
      active: isGroupActive(group),
      exposedToLlm: llmExposed.value.get(group.name) ?? false,
    })),
    llmMode: llmMode.value,
  }))

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
  function resolve(name: string): { kind: 'group', group: ExpressionGroupDefinition } | { kind: 'param', entry: ExpressionEntry } | null {
    const group = expressionGroups.value.get(name)
    if (group)
      return { kind: 'group', group }

    const entry = expressions.value.get(name)
    if (entry)
      return { kind: 'param', entry }

    return null
  }

  /**
   * Set an expression or parameter value.
   */
  function set(name: string, value: boolean | number, duration?: number): ExpressionToolResult {
    const resolved = resolve(name)

    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" not found.`,
        available: allNames(),
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
      return { success: true, state: states }
    }

    // Direct parameter
    applyValue(resolved.entry, numericValue, duration)
    return { success: true, state: toState(resolved.entry) }
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
      return { success: true, state: states }
    }

    const resolved = resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" not found.`,
        available: allNames(),
      }
    }

    if (resolved.kind === 'group') {
      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = expressions.value.get(param.parameterId)
        if (entry)
          states.push(toState(entry))
      }
      return { success: true, state: states }
    }

    return { success: true, state: toState(resolved.entry) }
  }

  /**
   * Toggle an expression (flip between default and non-default).
   */
  function toggle(name: string, duration?: number): ExpressionToolResult {
    const resolved = resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" not found.`,
        available: allNames(),
      }
    }

    if (resolved.kind === 'group') {
      // A group is "active" when at least one of its non-zero (activation)
      // params is currently set to the exp3 value.  Zero-valued params are
      // "reset" instructions and are excluded from the active check.
      const isActive = isGroupActive(resolved.group)
      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = expressions.value.get(param.parameterId)
        if (entry) {
          const newValue = isActive ? entry.modelDefault : param.value
          applyValue(entry, newValue, duration)
          states.push(toState(entry))
        }
      }
      return { success: true, state: states }
    }

    // Direct parameter toggle: flip between modelDefault and exp3 target value
    const entry = resolved.entry
    const newValue = entry.currentValue !== entry.modelDefault ? entry.modelDefault : entry.targetValue
    applyValue(entry, newValue, duration)
    return { success: true, state: toState(entry) }
  }

  /**
   * Save current values as defaults (persisted across restarts).
   */
  function saveDefaults(): ExpressionToolResult {
    if (!modelId.value) {
      return { success: false, error: 'No model loaded.' }
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
    return { success: true, state: states }
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

  function setLlmMode(mode: Live2DExpressionLlmMode) {
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

  /** Applies a settings command in the renderer that owns the Live2D runtime. */
  function applySettingsCommand(command: Live2DExpressionSettingsCommand): ExpressionToolResult | void {
    switch (command.type) {
      case 'toggle':
        return toggle(command.name)
      case 'set-llm-mode':
        setLlmMode(command.mode)
        return
      case 'set-llm-exposed':
        setLlmExposed(command.name, command.exposed)
        return
      case 'save-defaults':
        return saveDefaults()
      case 'reset-all':
        return resetAll()
    }
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
    // State (read-only externally, but reactive)
    expressions,
    modelId,
    expressionGroups,
    llmMode,
    llmExposed,
    settingsSnapshot,

    // Actions
    registerExpressions,
    resolve,
    set,
    get,
    toggle,
    saveDefaults,
    resetAll,
    dispose,
    setLlmMode,
    setLlmExposed,
    isExposedToLlm,
    applySettingsCommand,
  }
})
