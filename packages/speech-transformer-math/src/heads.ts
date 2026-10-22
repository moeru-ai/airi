/**
 * The MathJSON head of each relation, keyed by the canonical TeX spelling of {@link canonicalSymbol}.
 * The renderer maps the head back to the words of the relation.
 */
export const relationHeads: Readonly<Record<string, string>> = {
  '=': 'Equal',
  '\\neq': 'NotEqual',
  '<': 'Less',
  '>': 'Greater',
  '\\ll': 'MuchLess',
  '\\gg': 'MuchGreater',
  '\\leq': 'LessEqual',
  '\\geq': 'GreaterEqual',
  '\\approx': 'Approx',
  '\\equiv': 'Equivalent',
  '\\perp': 'Perpendicular',
  '\\parallel': 'Parallel',
  '\\in': 'Element',
  '\\notin': 'NotElement',
  '\\ni': 'Contains',
  '\\subseteq': 'SubsetEqual',
  '\\subset': 'Subset',
  '\\supseteq': 'SupersetEqual',
  '\\supset': 'Superset',
  '\\nsubseteq': 'NotSubsetEqual',
  '\\nsupseteq': 'NotSupersetEqual',
  '\\sim': 'Similar',
  '\\cong': 'Congruent',
  '\\to': 'To',
  '\\mapsto': 'MapsTo',
  '\\Rightarrow': 'Implies',
  '\\Leftrightarrow': 'Iff',
  '\\propto': 'Proportional',
  '\\gtrsim': 'GreaterApprox',
  '\\lesssim': 'LessApprox',
  '\\mid': 'Divides',
  '\\nmid': 'NotDivides',
  '\\vdash': 'Proves',
  '\\coloneqq': 'Assign',
}

/** The MathJSON head of each binary operator, keyed by its canonical TeX spelling. */
export const operatorHeads: Readonly<Record<string, string>> = {
  '+': 'Add',
  '-': 'Subtract',
  '\\times': 'Multiply',
  '\\cdot': 'Multiply',
  // `a / b` and `a \div b` are read as a division, unlike `\frac`, which is `Divide`.
  '\\div': 'InlineDivide',
  '\\pm': 'PlusMinus',
  '\\mp': 'MinusPlus',
  '\\cup': 'Union',
  '\\cap': 'Intersection',
  '\\setminus': 'SetMinus',
  '\\sqcup': 'DisjointUnion',
  '\\triangle': 'SymmetricDifference',
  // A ring between two operands composes functions, as in `f \\circ g`. As a superscript it is degrees, see lowerScripts.
  '\\circ': 'Compose',
}

/** Operators that bind tighter than the others, so `a + b \times c` is `a + (b c)`. */

/**
 * The head of a raw command that no extension lowered yet: `["Raw", 'command', 'source']`, see ./extension.
 * {@link MathSpeech} replaces it with the MathJSON of the extension that owns the command.
 */
export const rawHead = 'Raw'
