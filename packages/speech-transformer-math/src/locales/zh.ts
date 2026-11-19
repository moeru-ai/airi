import type { MathLocale, Relation } from '../locale'

import { aliases, greek, joinCompact, unitPower } from '../locale'

const chineseOrders: Readonly<Record<string, string>> = { 2: '二', 3: '三', 4: '四' }

export const zh: MathLocale = {
  language: 'zh',
  join: joinCompact,
  // Chinese voices read digits in Chinese, so the digits stay.
  number: digits => digits,
  letter: letter => letter,
  // A Latin letter takes the short form 大A and 小a, as a teacher says it. A Greek name takes 大写 and 小写.
  letterCase: (spoken, upper) => /^[a-z]$/i.test(spoken) ? `${upper ? '大' : '小'}${spoken}` : `${upper ? '大写' : '小写'}${spoken}`,
  clauses: parts => parts.join('，'),
  cases: items => items.map(({ value, condition }) => condition === undefined ? `其他情况下为${value}` : `当${condition}时为${value}`).join('，'),
  matrix: (rows, determinant) => `${determinant ? '行列式' : '矩阵'}，${rows.map((row, index) => `第${index + 1}行是${row.join('、')}`).join('，')}`,
  list: items => items.join('、'),
  words: {
    ...greek(['阿尔法', '贝塔', '伽马', '德尔塔', '艾普西隆', '艾普西隆', '泽塔', '伊塔', '西塔', '西塔', '约塔', '卡帕', '兰姆达', '缪', '纽', '克西', '欧米克戎', '派', '柔', '西格玛', '陶', '宇普西隆', '斐', '斐', '希', '普西', '欧米伽']),
    '\\nabla': '那勃勒',
    '∇': '那勃勒',
    '\\varsigma': '西格玛',
    'M_\\odot': '太阳质量',
    'L_\\odot': '太阳光度',
    'R_\\odot': '太阳半径',
    '\\checkmark': '对勾',
    '\\frown': '卡积',
    '\\ast': '星号',
    '\\infty': '无穷大',
    '∞': '无穷大',
    '\\angle': '角',
    '∠': '角',
    '\\triangle': '三角形',
    '△': '三角形',
    '\\odot': '圆',
    '⊙': '圆',
    '\\circ': '度',
    '°': '度',
    '\\cdots': '依此类推',
    '\\ldots': '依此类推',
    '\\dots': '依此类推',
    '…': '依此类推',
    '\\emptyset': '空集',
    '\\varnothing': '空集',
    '∅': '空集',
    '\\forall': '对任意',
    '\\exists': '存在',
    '\\nexists': '不存在',
    '∄': '不存在',
    '\\aleph': '阿列夫',
    'ℵ': '阿列夫',
    '\\therefore': '所以',
    '\\because': '因为',
    '\\partial': '偏',
    '\\sin': 'sine',
    '\\cos': 'cosine',
    '\\tan': 'tangent',
    '\\cot': 'cotangent',
    '\\sec': 'secant',
    '\\csc': 'cosecant',
    '\\log': 'log',
    '\\lg': 'lg',
    '\\ln': 'ln',
    '\\lim': '极限',
    '\\max': '最大值',
    '\\min': '最小值',
    '\\mid': '满足',
    '\\%': '百分号',
    '%': '百分号',
  },
  operators: aliases({ '+': '加', '-': '减', '\\times': '乘', '\\cdot': '乘', '\\div': '除以', '\\pm': '正负', '\\mp': '负正', '\\cup': '并', '\\cap': '交', '\\setminus': '减', '\\sqcup': '不交并', '\\triangle': '对称差', '\\circ': '复合', '!': '的阶乘' }),
  negative: '负',
  positive: '正',
  relations: aliases<Relation>({
    '=': (l, r) => `${l} 等于 ${r}`,
    '\\neq': (l, r) => `${l} 不等于 ${r}`,
    '<': (l, r) => `${l} 小于 ${r}`,
    '>': (l, r) => `${l} 大于 ${r}`,
    '\\ll': (l, r) => `${l} 远小于 ${r}`,
    '\\gg': (l, r) => `${l} 远大于 ${r}`,
    '\\leq': (l, r) => `${l} 小于等于 ${r}`,
    '\\geq': (l, r) => `${l} 大于等于 ${r}`,
    '\\approx': (l, r) => `${l} 约等于 ${r}`,
    '\\equiv': (l, r) => `${l} 恒等于 ${r}`,
    '\\perp': (l, r) => `${l} 垂直于 ${r}`,
    '\\parallel': (l, r) => `${l} 平行于 ${r}`,
    '\\in': (l, r) => `${l} 属于 ${r}`,
    '\\notin': (l, r) => `${l} 不属于 ${r}`,
    '\\ni': (l, r) => `${l} 包含元素 ${r}`,
    '\\subseteq': (l, r) => `${l} 包含于 ${r}`,
    '\\subset': (l, r) => `${l} 真包含于 ${r}`,
    '\\supseteq': (l, r) => `${l} 包含 ${r}`,
    '\\supset': (l, r) => `${l} 真包含 ${r}`,
    '\\nsubseteq': (l, r) => `${l} 不包含于 ${r}`,
    '\\nsupseteq': (l, r) => `${l} 不包含 ${r}`,
    '\\sim': (l, r) => `${l} 相似于 ${r}`,
    '\\cong': (l, r) => `${l} 全等于 ${r}`,
    '\\to': (l, r) => `${l} 趋于 ${r}`,
    '\\mapsto': (l, r) => `${l} 映射到 ${r}`,
    '\\Rightarrow': (l, r) => `${l} 推出 ${r}`,
    '\\Leftrightarrow': (l, r) => `${l} 等价于 ${r}`,
    '\\propto': (l, r) => `${l} 正比于 ${r}`,
    '\\gtrsim': (l, r) => `${l} 大于或约等于 ${r}`,
    '\\lesssim': (l, r) => `${l} 小于或约等于 ${r}`,
    '\\mid': (l, r) => `${l} 整除 ${r}`,
    '\\nmid': (l, r) => `${l} 不整除 ${r}`,
    '\\vdash': (l, r) => `由 ${l} 可推出 ${r}`,
    '\\coloneqq': (l, r) => `${l} 定义为 ${r}`,
  }),
  // The denominator comes first, so a power on the numerator can bind to the whole fraction: 6分之派的平方.
  fraction: (n, d, shape) => shape.numerator === 'compound' || shape.denominator === 'compound' || shape.numerator === 'scripted' || shape.followsOperator
    ? `分子是${n} 分母是${d}的分数`
    : `${d}分之${n}`,
  // A textbook says 二阶导 with a Chinese numeral, not 2阶导.
  derivative: (v, body, order) => `${body}对${v}求${order ? `${chineseOrders[order] ?? order}阶` : ''}导`,
  power: (b, e) => `${b}的${e}次方`,
  squared: b => `${b}的平方`,
  cubed: b => `${b}的立方`,
  degrees: b => `${b}度`,
  prime: b => `${b}撇`,
  superscript: (b, m) => `${b}上标${m}`,
  marks: { '\\ast': '星', '\\dagger': '共轭转置', '\\vee': '对偶' },
  // A simple call keeps the reading of a product, as Chinese teachers read `f(x)`. A grouped call says its parentheses.
  // A function with several arguments says 关于 between its name and the arguments, as in v下标西塔关于x下标t和t.
  // Bracket words are heavy, and a comma between the arguments let the TTS chunker cut the formula in two requests.
  // A point, as `P(1, 2)`, keeps its brackets: its name is one capital letter. A decorated name or an argument with an
  // operator keeps them too, so `\hat H(t)` is not heard as a product and `f(x+1)` is not heard as `f(x) + 1`.
  apply: (f, args, grouped, decorated) => {
    if (args.length > 1 && !/^[A-Z]$/.test(f))
      return `${f}关于${args.join('和')}`
    return grouped || decorated ? `${f}括号${args.join('，')}括号` : joinCompact([f, ...args])
  },
  upTo: x => `直到${x}`,
  placeholder: '点',
  groupTimes: '乘以',
  numberIndex: (b, i) => `${b}${i}`,
  index: (b, i) => `${b}下标${i}`,
  subscript: (b, s) => `${b}下标${s}`,
  // 根号下 marks a compound radicand, so 根号下a的平方加b的平方 is not heard as the square of 根号a.
  ordinal: value => `第${value}`,
  given: (event, condition) => `${condition}条件下的${event}`,
  modulo: m => `模${m}`,
  congruent: (l, r, m) => `${l} 与 ${r} 模 ${m} 同余`,
  inverse: name => `${name}的反函数`,
  root: (x, n, compound) => n === undefined ? `根号${compound ? '下' : ''}${x}` : n === '3' ? `${x}的立方根` : `${x}的${n}次方根`,
  limit: (body, v, t, c, side) => {
    if (v !== undefined && t !== undefined)
      return side ? `当${v}从${side === 'right' ? '右' : '左'}侧趋于${t}时 ${body}的极限` : `当${v}趋于${t}时 ${body}的极限`
    return c ? `${c}时 ${body}的极限` : `${body}的极限`
  },
  norm: (x, index, squared) => `${x ? `${x}的` : ''}${index ?? ''}范数${squared ? '的平方' : ''}`,
  statistic: (kind, body, condition) => {
    const noun = { Expectation: '期望', Probability: '概率', Variance: '方差', Covariance: '协方差' }[kind]
    return condition ? `在${condition}下 ${body}的${noun}` : `${body}的${noun}`
  },
  about: x => `约${x}`,
  distributed: (x, d) => `${x}服从${d}`,
  arrow: (l, r) => `${l} 到 ${r}`,
  ceil: x => `${x}向上取整`,
  floor: x => `${x}向下取整`,
  tuple: items => `${items.length === 2 ? '有序对' : `${items.length}元组`}${items.join('、')}`,
  bracket: x => `方括号${x}方括号`,
  mapping: (f, from, to) => `${f} 是从${from}到${to}的映射`,
  bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
    const verb = { sum: '求和', prod: '求积', int: '积分', union: '求并集', intersection: '求交集' }[kind]
    if (kind === 'int' && improper)
      return `从${from ?? ''}到${to ?? ''}对${body}的反常积分`
    if (kind === 'int')
      return from !== undefined || to !== undefined ? `从${from ?? ''}到${to ?? ''}对${body}积分` : `对${body}积分`
    if (variable !== undefined && from !== undefined)
      return `${variable}从${from}到${to ?? '无穷大'}对${body}${verb}`
    return condition ? `${condition}时对${body}${verb}` : `对${body}${verb}`
  },
  absolute: x => `${x}的绝对值`,
  quantity: x => `括号${x}括号`,
  // A Chinese teacher reads `(a+b)^2` as a 与 b 的和的平方, without the brackets.
  groupOf: { sum: (a, b) => `${a}与${b}的和`, difference: (a, b) => `${a}与${b}的差` },
  set: (x, c) => c ? `满足${c}的${x}的集合` : `集合${x}`,
  interval: (a, b, { left, right }) => {
    if (left === right)
      return `${left ? '闭' : '开'}区间${a}到${b}`
    return `${left ? '左闭右开' : '左开右闭'}区间${a}到${b}`
  },
  complement: (set, universe) => universe ? `${set}在${universe}中的补集` : `${set}的补集`,
  powerSet: set => `${set}的幂集`,
  cardinality: set => `${set}的元素个数`,
  percent: n => `百分之${n}`,
  accent: {
    ket: b => `ket ${b}`,
    bra: b => `bra ${b}`,
    overline: b => `${b}拔`,
    bar: b => `${b}拔`,
    vec: b => `向量${b}`,
    overrightarrow: b => `向量${b}`,
    hat: b => `${b}帽`,
    widehat: b => `${b}帽`,
    tilde: b => `${b}波浪`,
    dot: b => `${b}点`,
    overarc: b => `弧${b}`,
    wideparen: b => `弧${b}`,
  },
  segment: name => `线段${name}`,
  binomial: (n, k) => `从${n}中取${k}的组合数`,
  unitRatio: (n, d, power) => `${n}每${unitPower(power, { 2: '平方', 3: '立方' })}${d}`,
  celsius: value => `${value}摄氏度`,
  numberSets: { 'R': '实数集', 'N': '自然数集', 'Z': '整数集', 'Q': '有理数集', 'C': '复数集', 'N+': '正整数集', 'N*': '正整数集', 'Z+': '正整数集', 'Z-': '负整数集', 'Z*': '非零整数集', 'R+': '正实数集', 'R-': '负实数集', 'R*': '非零实数集', 'Q+': '正有理数集' },
  units: {
    prefixes: { Q: '昆它', R: '容那', Y: '尧它', Z: '泽它', E: '艾可萨', P: '拍它', T: '太', G: '吉', M: '兆', k: '千', h: '百', da: '十', d: '分', c: '厘', m: '毫', µ: '微', n: '纳', p: '皮', f: '飞', a: '阿', z: '仄', y: '幺', r: '柔', q: '亏' },
    units: { m: '米', g: '克', s: '秒', A: '安培', K: '开尔文', mol: '摩尔', cd: '坎德拉', Hz: '赫兹', N: '牛顿', Pa: '帕斯卡', J: '焦耳', W: '瓦特', C: '库仑', V: '伏特', F: '法拉', Ω: '欧姆', S: '西门子', Wb: '韦伯', T: '特斯拉', H: '亨利', lm: '流明', lx: '勒克斯', Bq: '贝可勒尔', Gy: '戈瑞', Sv: '希沃特', kat: '开特', L: '升', l: '升', t: '吨', eV: '电子伏特', Da: '道尔顿', bar: '巴', B: '字节', bit: '比特', cal: '卡' },
    joinFactors: words => words.join(''),
    plain: { min: '分钟', h: '小时', d: '天', ha: '公顷', au: '天文单位', Å: '埃', atm: '标准大气压', Rt: '直角', dB: '分贝', ft: '英尺', mi: '英里' },
    // 公斤, not 千克: an ASR model writes 5千克 as 5000克.
    // 百帕 is what a weather report says. The composed 百帕斯卡 after 100 sounds like 一百百帕斯卡.
    overrides: { kg: '公斤', hPa: '百帕' },
    power: (words, power) => `${power === '2' ? '平方' : '立方'}${words}`,
  },
}
