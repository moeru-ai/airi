/** What a formula hook knows about the formula that it reads. */
export interface SpeechFormulaContext {
  /** The language of the formula as a primary language subtag, for example `zh`, selected from the words around it. */
  language: string
}

/** What a prose hook knows about the text that it rewrites. */
export interface SpeechProseContext {
  /** The language of the sentence around the text, as a primary language subtag. */
  language: string
  /** The language of the voice, used when the words do not select one. */
  fallback?: string
  /** `text` for plain text, `code` for inline code. The text of inline code keeps its symbols. */
  kind: 'text' | 'code'
  /** Reads a formula found in the text through the formula hooks. `context` is the words around it. */
  readFormula: (tex: string, context: string) => string
}

/**
 * A preprocessor plugin of `toSpeechText`. One plugin owns one kind of content, for example formulas or money.
 *
 * The host runs the hooks of all plugins in installation order:
 *
 * - `prepare` rewrites the markdown before it is parsed, for example to escape `$5` so it is not a formula.
 * - `formula` reads one TeX formula. The first plugin that returns a string wins.
 * - `prose` rewrites a run of text. Each plugin gets the output of the plugin before it.
 *
 * A plugin is trusted in-process code. A new reading or a special pronunciation is a new plugin, so the host and the
 * other plugins stay unchanged.
 */
export interface SpeechPreprocessor {
  /** A unique name, for logs and tests, for example `math`. */
  name: string
  prepare?: (markdown: string) => string
  formula?: (tex: string, context: SpeechFormulaContext) => string | undefined
  prose?: (text: string, context: SpeechProseContext) => string
}
