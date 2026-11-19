import type { ChemLocale } from '../locale'

import { spellNumber } from '@proj-airi/speech-transformer-math'

/** The English words of chemistry. */
export const en: ChemLocale = {
  language: 'en',
  // English reads the symbols of a formula, also inside an equation.
  names: {},
  formula: species => species.formula,
  // In an equation, the word ion ends the charge, so its plus is not heard as the plus between species: F E three plus
  // ion plus O H minus ion.
  ion: (formula, charge, inEquation) => `${formula} ${charge.slice(0, -1) ? spellNumber(charge.slice(0, -1), 'en') : ''} ${charge.endsWith('+') ? 'plus' : 'minus'}${inEquation ? ' ion' : ''}`.replace(/\s+/g, ' ').trim(),
  term: (name, coefficient) => coefficient ? `${coefficient} ${name}` : name,
  and: (l, r) => `${l} plus ${r}`,
  arrow: {
    '->': (r, p) => `${r} yields ${p}`,
    '<=>': (r, p) => `${r} is in equilibrium with ${p}`,
    '<-': (r, p) => `${p} yields ${r}`,
  },
  condition: (c, e) => `with ${c} ${e}`,
  gas: 'gas',
  heat: 'heat',
  precipitate: 'precipitate',
  spellsFormula: true,
  open: 'open parenthesis',
  close: 'close parenthesis',
  hydrate: 'dot',
}
