import { describe, expect, it } from 'vitest'

import { toSpeechText } from '.'

describe('toSpeechText', () => {
  it('removes markup that has no sound', () => {
    expect(toSpeechText('This is **important** and *soft*.')).toBe('This is important and soft.')
    expect(toSpeechText('这是**重要**的事情。')).toBe('这是重要的事情。')
    expect(toSpeechText('Read [the guide](https://example.com/guide) first.')).toBe('Read the guide first.')
    expect(toSpeechText('Run `pnpm test` now.')).toBe('Run pnpm test now.')
    expect(toSpeechText('A ![cat](cat.png) sleeps.')).toBe('A cat sleeps.')
  })

  it('puts a line break between blocks so that each block ends a TTS chunk', () => {
    expect(toSpeechText('# Plan\n\n- First step\n- Second step\n\n> Done')).toBe('Plan\nFirst step\nSecond step\nDone')
  })

  it('skips code blocks, HTML, and thematic breaks', () => {
    expect(toSpeechText('Before.\n\n```ts\nconst a = 1\n```\n\n---\n\n<div>hidden</div>\n\nAfter.')).toBe('Before.\nAfter.')
  })

  it('keeps symbols that the writer meant as operators', () => {
    expect(toSpeechText('2 * 3 = 6')).toBe('2 * 3 = 6')
    expect(toSpeechText('2*3 = 6')).toBe('2*3 = 6')
    expect(toSpeechText('2**10 = 1024')).toBe('2**10 = 1024')
    expect(toSpeechText('x ~= 3.14, ~3 hours')).toBe('x ~= 3.14, ~3 hours')
  })

  it('keeps delimiters that CommonMark reads as emphasis between ASCII operands', () => {
    expect(toSpeechText('x**2 + y**2 = r**2')).toBe('x**2 + y**2 = r**2')
    expect(toSpeechText('a*b*c')).toBe('a*b*c')
  })

  it('keeps each marker, also inside unspoken nodes, in source order', () => {
    const marker = ''

    expect(toSpeechText(`**${marker}Hi** there.`, { marker })).toBe(`${marker}Hi there.`)
    expect(toSpeechText(`See [docs](https://e.com/${marker}).`, { marker })).toBe(`See docs${marker}.`)
    expect(toSpeechText(`One.\n\n\`\`\`\n${marker}\n\`\`\`\n\nTwo.${marker}`, { marker })).toBe(`One.\n${marker}\nTwo.${marker}`)
  })

  // The cases of the T-151 baseline recording, in Chinese, English, Japanese, and Korean sentences.
  // Before this change each formula reached the TTS provider as TeX source, with `$` and backslashes.
  it.each([
    ['a-inline', 'zh', '巴塞尔问题的结论是 $\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}$，这个结果由欧拉证明。', '巴塞尔问题的结论是 当n趋于无穷大时 i从1到n对i的平方分之1求和的极限 等于 分子是派的平方 分母是6的分数，这个结果由欧拉证明。'],
    ['a-inline', 'en', 'The Basel problem states that $\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}$, which Euler proved.', 'The Basel problem states that the limit as n approaches infinity of the sum from i equals one to n of the fraction with numerator one and denominator i squared equals pi squared over six, which Euler proved.'],
    ['a-inline', 'ja', 'バーゼル問題の結論は $\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}$ で、オイラーが証明しました。', 'バーゼル問題の結論は エヌを無限大に近づけたときのアイがいちからエヌまでのアイの二乗分のいちの和の極限 イコール 分子がパイの二乗、分母がろくの分数 で、オイラーが証明しました。'],
    ['a-inline', 'ko', '바젤 문제의 결론은 $\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}$ 이며, 오일러가 증명했습니다.', '바젤 문제의 결론은 엔이 무한대로 갈 때 아이가 일부터 엔까지 아이 제곱 분의 일의 합의 극한은 분자가 파이 제곱, 분모가 육인 분수 이며, 오일러가 증명했습니다.'],
    ['a-block', 'zh', '巴塞尔问题的结论是：\n\n$$\n\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}\n$$\n\n这个结果由欧拉证明。', '巴塞尔问题的结论是：\n当n趋于无穷大时 i从1到n对i的平方分之1求和的极限 等于 分子是派的平方 分母是6的分数\n这个结果由欧拉证明。'],
    ['a-block', 'en', 'The Basel problem states that:\n\n$$\n\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}\n$$\n\nEuler proved this result.', 'The Basel problem states that:\nthe limit as n approaches infinity of the sum from i equals one to n of the fraction with numerator one and denominator i squared equals pi squared over six\nEuler proved this result.'],
    ['a-block', 'ja', 'バーゼル問題の結論は次のとおりです。\n\n$$\n\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}\n$$\n\nオイラーがこれを証明しました。', 'バーゼル問題の結論は次のとおりです。\nエヌを無限大に近づけたときのアイがいちからエヌまでのアイの二乗分のいちの和の極限 イコール 分子がパイの二乗、分母がろくの分数\nオイラーがこれを証明しました。'],
    ['a-block', 'ko', '바젤 문제의 결론은 다음과 같습니다.\n\n$$\n\\lim_{n \\to \\infty}\\sum_{i=1}^{n}\\frac{1}{i^2}=\\frac{\\pi^2}{6}\n$$\n\n오일러가 이를 증명했습니다.', '바젤 문제의 결론은 다음과 같습니다.\n엔이 무한대로 갈 때 아이가 일부터 엔까지 아이 제곱 분의 일의 합의 극한은 분자가 파이 제곱, 분모가 육인 분수\n오일러가 이를 증명했습니다.'],
    ['b1-water', 'zh', '氢气在氧气中燃烧的化学方程式是 $\\ce{2H2 + O2 -> 2H2O}$。', '氢气在氧气中燃烧的化学方程式是 氢气 和 氧气 反应生成 水。'],
    ['b1-water', 'en', 'When hydrogen burns in oxygen, the equation is $\\ce{2H2 + O2 -> 2H2O}$.', 'When hydrogen burns in oxygen, the equation is two H two plus O two yields two H two O.'],
    ['b1-water', 'ja', '水素が酸素中で燃える反応式は $\\ce{2H2 + O2 -> 2H2O}$ です。', '水素が酸素中で燃える反応式は 水素と酸素が反応して 水ができる です。'],
    ['b1-water', 'ko', '수소가 산소 속에서 타는 반응식은 $\\ce{2H2 + O2 -> 2H2O}$ 입니다.', '수소가 산소 속에서 타는 반응식은 수소와 산소가 반응하여 물이 생성된다 입니다.'],
    ['b2-h2so4', 'zh', '硫酸的化学式是 $H_2SO_4$，它是一种强酸。', '硫酸的化学式是 H2 S O4，它是一种强酸。'],
    ['b2-h2so4', 'en', 'The chemical formula of sulfuric acid is $H_2SO_4$, a strong acid.', 'The chemical formula of sulfuric acid is H two S O four, a strong acid.'],
    ['b2-h2so4', 'ja', '硫酸の化学式は $H_2SO_4$ で、強い酸です。', '硫酸の化学式は エイチにエスオーよん で、強い酸です。'],
    ['b2-h2so4', 'ko', '황산의 화학식은 $H_2SO_4$ 이며, 강산입니다.', '황산의 화학식은 에이치 아래첨자 이 에스 오 아래첨자 사 이며, 강산입니다.'],
    ['b3-fe3', 'zh', '三价铁离子写作 $\\ce{Fe^{3+}}$，它的溶液呈黄色。', '三价铁离子写作 Fe 3价正离子，它的溶液呈黄色。'],
    ['b3-fe3', 'en', 'The iron three ion is written as $\\ce{Fe^{3+}}$ in chemistry.', 'The iron three ion is written as F E three plus in chemistry.'],
    ['b3-fe3', 'ja', '鉄(III)イオンは $\\ce{Fe^{3+}}$ と書き、その水溶液は黄色です。', '鉄(III)イオンは エフ イー さん価の陽イオン と書き、その水溶液は黄色です。'],
    ['b3-fe3', 'ko', '철 3가 이온은 $\\ce{Fe^{3+}}$ 로 쓰며, 그 용액은 노란색입니다.', '철 3가 이온은 에프 E 삼가 양이온 로 쓰며, 그 용액은 노란색입니다.'],
    ['b4-nh3', 'zh', '合成氨是一个可逆反应：$\\ce{N2 + 3H2 <=> 2NH3}$。', '合成氨是一个可逆反应：氮气 和 氢气 可逆反应生成 氨气。'],
    ['b4-nh3', 'en', 'The Haber process is a reversible reaction: $\\ce{N2 + 3H2 <=> 2NH3}$.', 'The Haber process is a reversible reaction: N two plus three H two is in equilibrium with two N H three.'],
    ['b4-nh3', 'ja', 'アンモニアの合成は可逆反応です：$\\ce{N2 + 3H2 <=> 2NH3}$。', 'アンモニアの合成は可逆反応です：窒素と水素が可逆的に反応して アンモニアができる。'],
    ['b4-nh3', 'ko', '암모니아 합성은 가역 반응입니다: $\\ce{N2 + 3H2 <=> 2NH3}$.', '암모니아 합성은 가역 반응입니다: 질소와 수소가 가역적으로 반응하여 암모니아가 생성된다.'],
    ['c1-perp', 'zh', '已知 $AB \\perp CD$，垂足为 O。', '已知 A B 垂直于 C D，垂足为 O。'],
    ['c1-perp', 'en', 'Given that $AB \\perp CD$, the foot of the perpendicular is O.', 'Given that A B is perpendicular to C D, the foot of the perpendicular is O.'],
    ['c1-perp', 'ja', '$AB \\perp CD$ のとき、垂線の足を O とします。', 'エービーとシーディーは垂直 のとき、垂線の足を O とします。'],
    ['c1-perp', 'ko', '$AB \\perp CD$ 일 때, 수선의 발은 O 입니다.', '에이 비는 씨 디에 수직 일 때, 수선의 발은 O 입니다.'],
    ['c2-parallel', 'zh', '如果 $l_1 \\parallel l_2$，那么同位角相等。', '如果 l1 平行于 l2，那么同位角相等。'],
    ['c2-parallel', 'en', 'If $l_1 \\parallel l_2$, then the corresponding angles are equal.', 'If l one is parallel to l two, then the corresponding angles are equal.'],
    ['c2-parallel', 'ja', '$l_1 \\parallel l_2$ ならば、同位角は等しい。', 'エルいちとエルには平行 ならば、同位角は等しい。'],
    ['c2-parallel', 'ko', '$l_1 \\parallel l_2$ 이면 동위각은 같습니다.', '엘 아래첨자 일은 엘 아래첨자 이와 평행 이면 동위각은 같습니다.'],
    ['c3-leq', 'zh', '题目给出的条件是 $a \\leq b$。', '题目给出的条件是 a 小于等于 b。'],
    ['c3-leq', 'en', 'The problem gives the condition $a \\leq b$.', 'The problem gives the condition a is less than or equal to b.'],
    ['c3-leq', 'ja', '問題の条件は $a \\leq b$ です。', '問題の条件は エー 小なりイコール ビー です。'],
    ['c3-leq', 'ko', '문제의 조건은 $a \\leq b$ 입니다.', '문제의 조건은 에이는 비보다 작거나 같음 입니다.'],
    ['c4-in', 'zh', '设元素 $x \\in A$，则 x 满足该条件。', '设元素 x 属于 A，则 x 满足该条件。'],
    ['c4-in', 'en', 'Let the element $x \\in A$, so x satisfies the condition.', 'Let the element x is an element of A, so x satisfies the condition.'],
    ['c4-in', 'ja', '要素 $x \\in A$ とすると、x はこの条件を満たします。', '要素 エックスはエーに属する とすると、x はこの条件を満たします。'],
    ['c4-in', 'ko', '원소 $x \\in A$ 라고 하면, x는 이 조건을 만족합니다.', '원소 엑스는 에이의 원소 라고 하면, x는 이 조건을 만족합니다.'],
    ['c5-subseteq', 'zh', '这两个集合满足 $A \\subseteq B$。', '这两个集合满足 A 包含于 B。'],
    ['c5-subseteq', 'en', 'These two sets satisfy $A \\subseteq B$.', 'These two sets satisfy A is a subset of or equal to B.'],
    ['c5-subseteq', 'ja', 'この二つの集合は $A \\subseteq B$ を満たします。', 'この二つの集合は エーはビーに含まれる を満たします。'],
    ['c5-subseteq', 'ko', '두 집합은 $A \\subseteq B$ 를 만족합니다.', '두 집합은 에이는 비의 부분집합 를 만족합니다.'],
    ['c6-angle', 'zh', '在这个直角三角形中，$\\angle ABC = 90^\\circ$。', '在这个直角三角形中，角A B C 等于 90度。'],
    ['c6-angle', 'en', 'In this right triangle, $\\angle ABC = 90^\\circ$.', 'In this right triangle, angle A B C equals ninety degrees.'],
    ['c6-angle', 'ja', 'この直角三角形では、$\\angle ABC = 90^\\circ$ です。', 'この直角三角形では、角エービーシー イコール きゅうじゅう度 です。'],
    ['c6-angle', 'ko', '이 직각삼각형에서 $\\angle ABC = 90^\\circ$ 입니다.', '이 직각삼각형에서 각 에이 비 씨는 구십도 입니다.'],
    ['c7-similar', 'zh', '由此可得 $\\triangle ABC \\sim \\triangle DEF$。', '由此可得 三角形A B C 相似于 三角形D E F。'],
    ['c7-similar', 'en', 'It follows that $\\triangle ABC \\sim \\triangle DEF$.', 'It follows that triangle A B C is similar to triangle D E F.'],
    ['c7-similar', 'ja', 'したがって、$\\triangle ABC \\sim \\triangle DEF$ です。', 'したがって、三角形エービーシーと三角形ディーイーエフは相似 です。'],
    ['c7-similar', 'ko', '따라서 $\\triangle ABC \\sim \\triangle DEF$ 입니다.', '따라서 삼각형 에이 비 씨와 삼각형 디 E 에프는 닮음 입니다.'],
  ])('reads the baseline formula %s in %s', (_, __, markdown, speech) => {
    expect(toSpeechText(markdown)).toBe(speech)
  })

  it('reads a formula in the language of its sentence, and in the voice language without words around it', () => {
    expect(toSpeechText('$x \\in A$')).toBe('x is an element of A')
    expect(toSpeechText('$x \\in A$', { language: 'ja-JP' })).toBe('エックスはエーに属する')
    expect(toSpeechText('$x \\in A$', { language: 'ko-KR' })).toBe('엑스는 에이의 원소')
    expect(toSpeechText('$x \\in A$', { language: 'zh-CN' })).toBe('x 属于 A')
    // Thai has no lexicon yet. English is used.
    expect(toSpeechText('$x \\in A$', { language: 'th-TH' })).toBe('x is an element of A')
    // Han text without kana is Japanese only when the voice is Japanese.
    expect(toSpeechText('元素 $x \\in A$。', { language: 'ja-JP' })).toBe('元素 エックスはエーに属する。')
    expect(toSpeechText('Then 设 $x \\in A$。')).toBe('Then 设 x 属于 A。')
    expect(toSpeechText('First, $a \\leq b$. 然后 $x \\in A$。')).toBe('First, a is less than or equal to b. 然后 x 属于 A。')
  })

  it('reads the other TeX delimiters and TeX without delimiters', () => {
    expect(toSpeechText('Inline \\(a_1 \\times b_1\\) here.')).toBe('Inline a one times b one here.')
    expect(toSpeechText('结果：\\[\\frac{1}{2}\\]')).toBe('结果：2分之1')
    expect(toSpeechText('集合 $A=\\{x \\mid x \\in \\mathbb{R}\\}$。')).toBe('集合 A 等于 满足x 属于 实数集的x的集合。')
    expect(toSpeechText('设 \\alpha 为锐角，且 a \\leq b。')).toBe('设 阿尔法 为锐角，且 a 小于等于 b。')
    expect(toSpeechText('Water is \\ce{H2O}, and E = mc^2 holds.')).toBe('Water is H two O, and E equals m c squared holds.')
    expect(toSpeechText('Use `\\frac{1}{2}` here.')).toBe('Use one over two here.')
  })

  it('reads a script without braces in TeX without delimiters as the whole number', () => {
    // TeX applies `^` to one character, but a reply that writes `2^10` without `$` means 2 to the 10th power.
    expect(toSpeechText('2 的 10 次方也写成 2^10。')).toBe('2 的 10 次方也写成 2的10次方。')
    expect(toSpeechText('也写成 $2^10$。')).toBe('也写成 2的1次方0。')
  })

  it('reads prices as words, and keeps paths and code that only look like TeX', () => {
    expect(toSpeechText('It costs $5 and $10 today.')).toBe('It costs five dollars and ten dollars today.')
    expect(toSpeechText('价格$5，另一个$10。')).toBe('价格5美元，另一个10美元。')
    expect(toSpeechText('A ticket is $5, and the area is $x^2$.')).toBe('A ticket is five dollars, and the area is x squared.')
    expect(toSpeechText('チケットは $5、面積は $x^2$ です。')).toBe('チケットは ごドル、面積は エックスの二乗 です。')
    expect(toSpeechText('Open C:\\Users\\neko now.')).toBe('Open C:\\Users\\neko now.')
    expect(toSpeechText('Before.\n\n```tex\n\\(x\\)\n```\n\nAfter.')).toBe('Before.\nAfter.')
  })

  it('keeps a marker inside a formula', () => {
    const marker = '\uE000'

    expect(toSpeechText(`$a ${marker}\\leq b$ ok.`, { marker })).toBe(`a is less than or equal to b${marker} ok.`)
  })
})
