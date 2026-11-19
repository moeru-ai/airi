import type { ChemLocale } from '../locale'

import { compoundNames } from './names-zh'

/** The Chinese words of chemistry. */
export const zh: ChemLocale = {
  language: 'zh',
  names: compoundNames,
  formula: species => species.formula,
  ion: (formula, charge) => `${formula} ${charge.slice(0, -1) || '1'}价${charge.endsWith('+') ? '正' : '负'}离子`,
  // A Chinese textbook reads an equation by its substances: 氢气和氧气反应生成水. A substance has no count, so 2个氢气
  // is wrong. Counting needs 分子 or 原子 for each species, which the names do not tell, so coefficients are not read.
  term: name => name,
  and: (l, r) => `${l} 和 ${r}`,
  arrow: {
    '->': (r, p) => `${r} 反应生成 ${p}`,
    '<=>': (r, p) => `${r} 可逆反应生成 ${p}`,
    '<-': (r, p) => `${p} 反应生成 ${r}`,
  },
  decompose: (r, p) => `${r} 分解生成 ${p}`,
  condition: (c, e) => `在${c}条件下 ${e}`,
  gas: '气体',
  heat: '加热',
  precipitate: '沉淀',
  spellsFormula: false,
  open: '左括号',
  close: '右括号',
  hydrate: '点',
}
