import type { MathLocale, Relation } from '../locale'

import { aliases, greek, joinCompact, letterName, unitPower } from '../locale'
import { spellNumber } from '../numbers'

/** Latin letter names, A to Z. A Japanese listener names a Latin letter this way. */
const jaLetterNames = ['エー', 'ビー', 'シー', 'ディー', 'イー', 'エフ', 'ジー', 'エイチ', 'アイ', 'ジェー', 'ケー', 'エル', 'エム', 'エヌ', 'オー', 'ピー', 'キュー', 'アール', 'エス', 'ティー', 'ユー', 'ブイ', 'ダブリュー', 'エックス', 'ワイ', 'ゼット']

export const ja: MathLocale = {
  language: 'ja',
  join: joinCompact,
  number: digits => spellNumber(digits, 'ja'),
  letter: letter => letterName(jaLetterNames, letter),
  letterCase: (spoken, upper) => `${upper ? '大文字の' : '小文字の'}${spoken}`,
  clauses: parts => parts.join('、'),
  cases: items => items.map(({ value, condition }) => condition === undefined ? `それ以外のとき${value}` : `${condition}のとき${value}`).join('、'),
  matrix: (rows, determinant) => `${determinant ? '行列式' : '行列'}、${rows.map((row, index) => `${spellNumber(String(index + 1), 'ja')}行目 ${row.join('、')}`).join('、')}`,
  list: items => items.join('、'),
  words: {
    ...greek(['アルファ', 'ベータ', 'ガンマ', 'デルタ', 'イプシロン', 'イプシロン', 'ゼータ', 'イータ', 'シータ', 'シータ', 'イオタ', 'カッパ', 'ラムダ', 'ミュー', 'ニュー', 'クサイ', 'オミクロン', 'パイ', 'ロー', 'シグマ', 'タウ', 'ウプシロン', 'ファイ', 'ファイ', 'カイ', 'プサイ', 'オメガ']),
    '\\nabla': 'ナブラ',
    '∇': 'ナブラ',
    '\\varsigma': 'シグマ',
    'M_\\odot': '太陽質量',
    'L_\\odot': '太陽光度',
    'R_\\odot': '太陽半径',
    '\\checkmark': 'チェックマーク',
    '\\frown': 'キャップ積',
    '\\ast': 'アスタリスク',
    '\\infty': '無限大',
    '∞': '無限大',
    '\\angle': '角',
    '∠': '角',
    '\\triangle': '三角形',
    '△': '三角形',
    '\\odot': '円',
    '⊙': '円',
    '\\circ': '度',
    '°': '度',
    '\\cdots': '以下同様',
    '\\ldots': '以下同様',
    '\\dots': '以下同様',
    '…': '以下同様',
    '\\emptyset': '空集合',
    '\\varnothing': '空集合',
    '∅': '空集合',
    '\\forall': '任意の',
    '\\exists': 'ある',
    '\\nexists': '存在しない',
    '∄': '存在しない',
    '\\aleph': 'アレフ',
    'ℵ': 'アレフ',
    '\\therefore': 'ゆえに',
    '\\because': 'なぜならば',
    '\\partial': 'ラウンド',
    '\\sin': 'サイン',
    '\\cos': 'コサイン',
    '\\tan': 'タンジェント',
    '\\cot': 'コタンジェント',
    '\\sec': 'セカント',
    '\\csc': 'コセカント',
    '\\log': 'ログ',
    '\\lg': 'ログ',
    '\\ln': 'エルエヌ',
    '\\lim': '極限',
    '\\max': '最大値',
    '\\min': '最小値',
    '\\mid': 'ただし',
    '\\%': 'パーセント',
    '%': 'パーセント',
  },
  operators: aliases({ '+': 'プラス', '-': 'マイナス', '\\times': 'かける', '\\cdot': 'かける', '\\div': 'わる', '\\pm': 'プラスマイナス', '\\mp': 'マイナスプラス', '\\cup': 'カップ', '\\cap': 'キャップ', '\\setminus': 'マイナス', '\\sqcup': '直和', '\\triangle': '対称差', '\\circ': '合成', '!': 'の階乗' }),
  negative: 'マイナス',
  positive: 'プラス',
  relations: aliases<Relation>({
    '=': (l, r) => `${l} イコール ${r}`,
    '\\neq': (l, r) => `${l} ノットイコール ${r}`,
    '<': (l, r) => `${l} 小なり ${r}`,
    '>': (l, r) => `${l} 大なり ${r}`,
    '\\ll': (l, r) => `${l}は${r}よりずっと小さい`,
    '\\gg': (l, r) => `${l}は${r}よりずっと大きい`,
    '\\leq': (l, r) => `${l} 小なりイコール ${r}`,
    '\\geq': (l, r) => `${l} 大なりイコール ${r}`,
    '\\approx': (l, r) => `${l} ニアリーイコール ${r}`,
    // 合同 is a congruence modulo n, see `congruent`. Alone, `\\equiv` is an identity.
    '\\equiv': (l, r) => `${l}は${r}と恒等的に等しい`,
    '\\perp': (l, r) => `${l}と${r}は垂直`,
    '\\parallel': (l, r) => `${l}と${r}は平行`,
    '\\in': (l, r) => `${l}は${r}に属する`,
    '\\notin': (l, r) => `${l}は${r}に属さない`,
    '\\ni': (l, r) => `${l}は${r}を要素に持つ`,
    '\\subseteq': (l, r) => `${l}は${r}に含まれる`,
    // A Japanese textbook writes ⊂ for a subset, not a proper one.
    '\\subset': (l, r) => `${l}は${r}に含まれる`,
    '\\supseteq': (l, r) => `${l}は${r}を含む`,
    '\\supset': (l, r) => `${l}は${r}を真に含む`,
    '\\nsubseteq': (l, r) => `${l}は${r}に含まれない`,
    '\\nsupseteq': (l, r) => `${l}は${r}を含まない`,
    '\\sim': (l, r) => `${l}と${r}は相似`,
    '\\cong': (l, r) => `${l}と${r}は合同`,
    '\\to': (l, r) => `${l}を${r}に近づける`,
    '\\mapsto': (l, r) => `${l}を${r}に写す`,
    '\\Rightarrow': (l, r) => `${l} ならば ${r}`,
    '\\Leftrightarrow': (l, r) => `${l} と ${r} は同値`,
    '\\propto': (l, r) => `${l}は${r}に比例する`,
    '\\gtrsim': (l, r) => `${l} 大なりニアリーイコール ${r}`,
    '\\lesssim': (l, r) => `${l} 小なりニアリーイコール ${r}`,
    '\\mid': (l, r) => `${l}は${r}を割り切る`,
    '\\nmid': (l, r) => `${l}は${r}を割り切らない`,
    '\\vdash': (l, r) => `${l}から${r}が導かれる`,
    '\\coloneqq': (l, r) => `${l}を${r}と定義する`,
  }),
  // The denominator comes first, so a power on the numerator can bind to the whole fraction: 6分のパイの二乗.
  fraction: (n, d, shape) => shape.numerator === 'compound' || shape.denominator === 'compound' || shape.numerator === 'scripted' || shape.followsOperator
    ? `分子が${n}、分母が${d}の分数`
    : `${d}分の${n}`,
  derivative: (v, body, order) => `${body}を${v}で${order ? `${spellNumber(order, 'ja')}回` : ''}微分したもの`,
  power: (b, e) => `${b}の${e}乗`,
  squared: b => `${b}の二乗`,
  cubed: b => `${b}の三乗`,
  degrees: b => `${b}度`,
  prime: b => `${b}プライム`,
  superscript: (b, m) => `${b}上付き${m}`,
  marks: { '\\ast': 'スター', '\\dagger': 'ダガー', '\\vee': '双対' },
  // A simple call keeps the reading of a product, as `f(x)` reads エフエックス. A grouped call says its parentheses.
  apply: (f, args, grouped, decorated) => grouped || decorated ? `${f}かっこ${args.join('、')}かっことじ` : joinCompact([f, ...args]),
  upTo: x => `${x}まで`,
  range: (from, to) => `${from}から${to}まで`,
  // 以下同様 inside a chain is heard as 以下, which means less than or equal. A chain through an ellipsis reads its range
  // and the rule for neighbours instead. Other chains read as written.
  chain: (operands, relations) => {
    if (operands.includes(undefined) && relations.every(relation => relation === relations[0]))
      return `${operands[0]}から${operands.at(-1)}まで、${relations[0]!('前の値', '次の値')}`
    return relations.reduce((left, relation, index) => relation(left, operands[index + 1] ?? ''), operands[0] ?? '')
  },
  placeholder: 'ドット',
  numberIndex: (b, i) => `${b}${i}`,
  index: (b, i) => `${b}下付き${i}`,
  subscript: (b, s) => `${b}下付き${s}`,
  // A compound radicand takes かっこ, as a compound group does, so ルートエックスプラスいち is only `\sqrt{x}+1`.
  ordinal: value => `${value}番目`,
  given: (event, condition) => `${condition}のもとでの${event}`,
  modulo: m => `${m}を法として`,
  congruent: (l, r, m) => `${l}と${r}は${m}を法として合同`,
  inverse: name => `${name}の逆関数`,
  root: (x, n, compound) => n === undefined ? (compound ? `ルートかっこ${x}かっことじ` : `ルート${x}`) : `${x}の${n}乗根`,
  limit: (body, v, t, c, side) => {
    if (v !== undefined && t !== undefined)
      return `${v}を${side ? `${side === 'right' ? '右' : '左'}から` : ''}${t}に近づけたときの${body}の極限`
    return c ? `${c}のときの${body}の極限` : `${body}の極限`
  },
  norm: (x, index, squared) => `${x ? `${x}の` : ''}${index ? `${index}` : ''}ノルム${squared ? 'の二乗' : ''}`,
  statistic: (kind, body, condition) => {
    const noun = { Expectation: '期待値', Probability: '確率', Variance: '分散', Covariance: '共分散' }[kind]
    return condition ? `${condition}としたときの${body}の${noun}` : `${body}の${noun}`
  },
  about: x => `約${x}`,
  distributed: (x, d) => `${x}が${d}に従う`,
  arrow: (l, r) => `${l}から${r}へ`,
  ceil: x => `${x}の切り上げ`,
  floor: x => `${x}の切り捨て`,
  tuple: items => `${items.join('、')}の組`,
  bracket: x => `大かっこ${x}大かっことじ`,
  mapping: (f, from, to) => `${f}は${from}から${to}への写像`,
  bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
    const noun = { sum: '和', prod: '積', int: improper ? '広義積分' : '積分', union: '和集合', intersection: '共通部分' }[kind]
    if (kind === 'int')
      return from !== undefined || to !== undefined ? `${from ?? ''}から${to ?? ''}までの${body}の${noun}` : `${body}の${noun}`
    if (variable !== undefined && from !== undefined)
      return `${variable}が${from}から${to ?? '無限大'}までの${body}の${noun}`
    return condition ? `${condition}についての${body}の${noun}` : `${body}の${noun}`
  },
  absolute: x => `${x}の絶対値`,
  quantity: x => `かっこ${x}かっことじ`,
  // を満たす reads a condition that ends with a relation word, as 大なり ゼロ. ような after ゼロ is not a sentence.
  set: (x, c) => c ? `${c} を満たす${x}の集合` : `集合${x}`,
  interval: (a, b, { left, right }) => {
    if (left === right)
      return `${a}から${b}までの${left ? '閉' : '開'}区間`
    return left ? `${a}以上${b}未満の区間` : `${a}より大きく${b}以下の区間`
  },
  complement: (set, universe) => universe ? `${universe}における${set}の補集合` : `${set}の補集合`,
  powerSet: set => `${set}の冪集合`,
  cardinality: set => `${set}の要素の個数`,
  percent: n => `${n}パーセント`,
  accent: {
    ket: b => `ケット${b}`,
    bra: b => `ブラ${b}`,
    overline: b => `${b}バー`,
    bar: b => `${b}バー`,
    vec: b => `ベクトル${b}`,
    overrightarrow: b => `ベクトル${b}`,
    hat: b => `${b}ハット`,
    widehat: b => `${b}ハット`,
    tilde: b => `${b}チルダ`,
    dot: b => `${b}ドット`,
    overarc: b => `弧${b}`,
    wideparen: b => `弧${b}`,
  },
  segment: name => `線分${name}`,
  binomial: (n, k) => `${n}個から${k}個選ぶ組み合わせ`,
  unitRatio: (n, d, power) => `${n}毎${unitPower(power, { 2: '平方', 3: '立方' })}${d}`,
  celsius: value => `摂氏${value}度`,
  numberSets: { 'R': '実数全体の集合', 'N': '自然数全体の集合', 'Z': '整数全体の集合', 'Q': '有理数全体の集合', 'C': '複素数全体の集合', 'N+': '正の整数全体の集合', 'N*': '正の整数全体の集合', 'Z+': '正の整数全体の集合', 'Z-': '負の整数全体の集合', 'Z*': 'ゼロでない整数全体の集合', 'R+': '正の実数全体の集合', 'R-': '負の実数全体の集合', 'R*': 'ゼロでない実数全体の集合', 'Q+': '正の有理数全体の集合' },
  units: {
    prefixes: { Q: 'クエタ', R: 'ロナ', Y: 'ヨタ', Z: 'ゼタ', E: 'エクサ', P: 'ペタ', T: 'テラ', G: 'ギガ', M: 'メガ', k: 'キロ', h: 'ヘクト', da: 'デカ', d: 'デシ', c: 'センチ', m: 'ミリ', µ: 'マイクロ', n: 'ナノ', p: 'ピコ', f: 'フェムト', a: 'アト', z: 'ゼプト', y: 'ヨクト', r: 'ロント', q: 'クエクト' },
    units: { m: 'メートル', g: 'グラム', s: '秒', A: 'アンペア', K: 'ケルビン', mol: 'モル', cd: 'カンデラ', Hz: 'ヘルツ', N: 'ニュートン', Pa: 'パスカル', J: 'ジュール', W: 'ワット', C: 'クーロン', V: 'ボルト', F: 'ファラド', Ω: 'オーム', S: 'ジーメンス', Wb: 'ウェーバ', T: 'テスラ', H: 'ヘンリー', lm: 'ルーメン', lx: 'ルクス', Bq: 'ベクレル', Gy: 'グレイ', Sv: 'シーベルト', kat: 'カタール', L: 'リットル', l: 'リットル', t: 'トン', eV: '電子ボルト', Da: 'ダルトン', bar: 'バール', B: 'バイト', bit: 'ビット', cal: 'カロリー' },
    joinFactors: words => words.join(''),
    plain: { min: '分', h: '時間', d: '日', ha: 'ヘクタール', au: '天文単位', Å: 'オングストローム', atm: '気圧', Rt: '直角', dB: 'デシベル', ft: 'フィート', mi: 'マイル' },
    // 時速 reads km/h as 毎時, and 時間 is a duration.
    denominators: { h: '時' },
    power: (words, power) => `${power === '2' ? '平方' : '立方'}${words}`,
  },
}
