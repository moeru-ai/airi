import { describe, expect, it } from 'vitest'

import { escapePrices, speakPrices } from './prices'

describe('prices', () => {
  it('escapes the dollar sign of a price, and keeps formulas', () => {
    // remark-math paired `$5, and the area is $` as one formula before.
    expect(escapePrices('A ticket is $5, and the area is $x^2$.')).toBe('A ticket is \\$5, and the area is $x^2$.')
    expect(escapePrices('It costs $5 and $10 today.')).toBe('It costs \\$5 and \\$10 today.')
    expect(escapePrices('$2 + 3$ and $5$ and $3\\times10^{8}$')).toBe('$2 + 3$ and $5$ and $3\\times10^{8}$')
    expect(escapePrices('Use `$5` here.')).toBe('Use `$5` here.')
  })

  it.each([
    ['Apples cost $3 and $1.', 'en', 'Apples cost three dollars and one dollar.'],
    ['家賃は月 $1,200 です。', 'ja', '家賃は月 せんにひゃくドル です。'],
    ['사과는 $3, 바나나는 $5입니다.', 'ko', '사과는 삼 달러, 바나나는 오 달러입니다.'],
    ['这本书售价 $19.99。', 'zh', '这本书售价 19.99美元。'],
  ] as const)('reads the prices of %s as words', (text, language, speech) => {
    expect(speakPrices(text, language)).toBe(speech)
  })
})
