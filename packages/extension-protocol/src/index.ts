export type Localizable
  = | string
    | {
    /**
     * Localization key owned by the module.
     * Example: "config.deprecated.model_driver.legacy"
     */
      key: string
      /**
       * Fallback display string when translation is unavailable.
       */
      fallback?: string
      /**
       * Params for string interpolation.
       */
      params?: Record<string, string | number | boolean>
    }

/**
 * Identifies an extension package/session that is loaded by an extension host.
 *
 * Extension identity is the package/session-level scope. Modules registered by
 * the extension get their own {@link ExtensionModuleIdentity}.
 */
export interface ExtensionIdentity {
  /**
   * Stable extension identifier from `extension.airi.json`.
   */
  id: string
  /**
   * Optional semantic version for the extension package.
   */
  version?: string
  /**
   * Optional runtime session id assigned by the host for this loaded extension.
   */
  sessionId?: string
  /**
   * Optional labels used for routing, inspection, and policy selectors.
   */
  labels?: Record<string, string>
}

/**
 * Identifies one runtime module registered by an extension setup function.
 */
export interface ExtensionModuleIdentity {
  /**
   * Stable module id within one extension session.
   */
  id: string
  /**
   * Owning extension session identity.
   */
  extension: ExtensionIdentity
  /**
   * Optional labels used for routing, inspection, and policy selectors.
   */
  labels?: Record<string, string>
}

export type ModulePermissionArea = 'apis' | 'resources' | 'capabilities' | 'processors' | 'pipelines'

export interface ModulePermissionSpec<
  Area extends ModulePermissionArea = ModulePermissionArea,
  Action extends string = string,
> {
  key: string
  actions: Action[]
  /**
   * Human-facing explanation for consent/permission UI.
   * Prefer i18n key form over raw strings for localization.
   */
  reason?: Localizable
  /**
   * Optional short display label for permission prompts.
   * Prefer i18n key form over raw strings for localization.
   */
  label?: Localizable
  required?: boolean
  metadata?: Record<string, unknown>
  area?: Area
}

export interface ModulePermissionDeclaration {
  apis?: ModulePermissionSpec<'apis', 'invoke' | 'emit'>[]
  resources?: ModulePermissionSpec<'resources', 'read' | 'write' | 'subscribe'>[]
  capabilities?: ModulePermissionSpec<'capabilities', 'wait' | 'snapshot'>[]
  processors?: ModulePermissionSpec<'processors', 'register' | 'execute' | 'manage'>[]
  pipelines?: ModulePermissionSpec<'pipelines', 'hook' | 'process' | 'emit' | 'manage'>[]
}

export type ModulePermissionGrant = ModulePermissionDeclaration

/**
 * Describes a single authorization failure produced by host-side permission checks.
 *
 * Protocol expectations:
 * - `area`, `action`, and `key` identify the denied operation
 * - `reason` is intended for user-facing or diagnostic context and may be localized
 * - `recoverable` indicates whether the caller may reasonably retry after obtaining consent,
 *   reconfiguration, or a state change
 * - plugins should not treat `reason` as a stable machine-readable code
 */
export interface ModulePermissionError {
  area: ModulePermissionArea
  action: string
  key: string
  reason?: Localizable
  recoverable?: boolean
}
