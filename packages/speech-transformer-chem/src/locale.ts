/** Reads a chemical species. `coefficient` is set only inside an equation. */
export interface ChemSpecies {
  formula: string
  /** Formula without charge, for example `Fe` for `Fe^{3+}`. */
  core: string
  /** Signed charge, for example `3+` or `2-`. */
  charge?: string
  coefficient?: string
  state?: string
}

/**
 * The words of chemistry in one language. The words around them, as numbers and letters, come from the math locale
 * pack of the same language.
 */
export interface ChemLocale {
  /** The language of the math locale pack that this locale goes with, for example `zh`. */
  language: string
  /**
   * Names for whole formulas. An equation reads the name. A formula alone keeps its symbols, because the text names it.
   */
  names: Readonly<Record<string, string>>
  formula: (species: ChemSpecies) => string
  /** Reads an ion. `inEquation` is true for a species of an equation, where more words follow it. */
  ion: (formula: string, charge: string, inEquation: boolean) => string
  term: (name: string, coefficient: string | undefined) => string
  and: (left: string, right: string) => string
  arrow: Readonly<Record<string, (reactants: string, products: string) => string>>
  /**
   * Reads a decomposition: one reactant that yields two or more products, as `2KClO3 -> 2KCl + 3O2`. A textbook says
   * 分解 there, not 反应. A locale without it reads the `->` arrow.
   */
  decompose?: (reactant: string, products: string) => string
  condition: (condition: string, equation: string) => string
  gas: string
  precipitate: string
  /** `\Delta` over an arrow. */
  heat: string
  /**
   * True when a formula is read symbol by symbol: letter names, spelled counts, and parentheses.
   * False keeps the formula as written, for example `H2SO4`, because the voice reads it.
   */
  spellsFormula: boolean
  /** Words for the parentheses of a group, for example `(OH)2`. */
  open: string
  close: string
  /** The dot of a hydrate, for example `CuSO4*5H2O`. */
  hydrate: string
}
