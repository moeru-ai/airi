import type { ChemLocale } from '../locale'

import { josa, spellNumber } from '@proj-airi/speech-transformer-math'

import { compoundNames } from './names-ko'

/** The Korean words of chemistry. */
export const ko: ChemLocale = {
  language: 'ko',
  names: compoundNames,
  formula: species => species.formula,
  ion: (formula, charge) => `${formula} ${spellNumber(charge.slice(0, -1) || '1', 'ko')}가 ${charge.endsWith('+') ? '양' : '음'}이온`,
  // A textbook reads an equation by its substances, as Chinese does. 분자 counts molecules, but metals, ionic solids,
  // and ions are not molecules, so 나트륨 이분자 is wrong. Coefficients are not read.
  term: name => name,
  and: (l, r) => `${josa(l, '과', '와')} ${r}`,
  arrow: {
    '->': (r, p) => `${josa(r, '이', '가')} 반응하여 ${josa(p, '이', '가')} 생성된다`,
    '<=>': (r, p) => `${josa(r, '이', '가')} 가역적으로 반응하여 ${josa(p, '이', '가')} 생성된다`,
    '<-': (r, p) => `${josa(p, '이', '가')} 반응하여 ${josa(r, '이', '가')} 생성된다`,
  },
  decompose: (r, p) => `${josa(r, '이', '가')} 분해되어 ${josa(p, '이', '가')} 생성된다`,
  condition: (c, e) => `${c} 조건에서 ${e}`,
  gas: '기체',
  heat: '가열',
  precipitate: '침전',
  spellsFormula: true,
  open: '괄호 열고',
  close: '괄호 닫고',
  hydrate: '점',
}
