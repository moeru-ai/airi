import type { MathLocale, Relation } from '../locale'

import { aliases, greek, joinSpaced, josa, letterName, unitPower } from '../locale'
import { spellNumber } from '../numbers'

/** Latin letter names, A to Z. A Korean listener names a Latin letter this way. */
const koLetterNames = ['에이', '비', '씨', '디', '이', '에프', '지', '에이치', '아이', '제이', '케이', '엘', '엠', '엔', '오', '피', '큐', '알', '에스', '티', '유', '브이', '더블유', '엑스', '와이', '제트']

/** Native Korean ordinals. 일행 for row one sounds like the number one, so a row is 첫째 행. */
const koreanOrdinals = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째']

export const ko: MathLocale = {
  language: 'ko',
  join: joinSpaced,
  number: digits => spellNumber(digits, 'ko'),
  // E keeps its Latin form: its name 이 is also the number 2, so `E=mc^2` would read as 2 equals m c squared.
  letter: letter => letter.toUpperCase() === 'E' ? letter : letterName(koLetterNames, letter),
  letterCase: (spoken, upper) => `${upper ? '대문자' : '소문자'} ${spoken}`,
  clauses: parts => parts.join(', '),
  // A Korean relation ends its sentence, so the condition follows its value with 단, as the set builder does.
  cases: items => items.map(({ value, condition }) => condition === undefined ? `그 외의 경우 ${value}` : `${value}, 단 ${condition}`).join('; '),
  matrix: (rows, determinant) => `${determinant ? '행렬식' : '행렬'}, ${rows.map((row, index) => `${koreanOrdinals[index] ?? `${spellNumber(String(index + 1), 'ko')}번째`} 행 ${row.join(', ')}`).join(', ')}`,
  list: items => items.join(', '),
  words: {
    ...greek(['알파', '베타', '감마', '델타', '엡실론', '엡실론', '제타', '에타', '세타', '세타', '요타', '카파', '람다', '뮤', '뉴', '크사이', '오미크론', '파이', '로', '시그마', '타우', '입실론', '피', '피', '카이', '프사이', '오메가']),
    '\\nabla': '나블라',
    '∇': '나블라',
    '\\varsigma': '시그마',
    'M_\\odot': '태양 질량',
    'L_\\odot': '태양 광도',
    'R_\\odot': '태양 반지름',
    '\\checkmark': '체크 표시',
    '\\frown': '캡곱',
    '\\ast': '별표',
    '\\infty': '무한대',
    '∞': '무한대',
    '\\angle': '각',
    '∠': '각',
    '\\triangle': '삼각형',
    '△': '삼각형',
    '\\odot': '원',
    '⊙': '원',
    '\\circ': '도',
    '°': '도',
    '\\cdots': '계속해서',
    '\\ldots': '계속해서',
    '\\dots': '계속해서',
    '…': '계속해서',
    '\\emptyset': '공집합',
    '\\varnothing': '공집합',
    '∅': '공집합',
    '\\forall': '모든',
    '\\exists': '어떤',
    '\\nexists': '존재하지 않는',
    '∄': '존재하지 않는',
    '\\aleph': '알레프',
    'ℵ': '알레프',
    '\\therefore': '따라서',
    '\\because': '왜냐하면',
    '\\partial': '라운드',
    '\\sin': '사인',
    '\\cos': '코사인',
    '\\tan': '탄젠트',
    '\\cot': '코탄젠트',
    '\\sec': '시컨트',
    '\\csc': '코시컨트',
    '\\log': '로그',
    '\\lg': '로그',
    '\\ln': '자연로그',
    '\\lim': '극한',
    '\\max': '최댓값',
    '\\min': '최솟값',
    '\\mid': '단',
    '\\%': '퍼센트',
    '%': '퍼센트',
  },
  operators: aliases({ '+': '더하기', '-': '빼기', '\\times': '곱하기', '\\cdot': '곱하기', '\\div': '나누기', '\\pm': '플러스 마이너스', '\\mp': '마이너스 플러스', '\\cup': '합집합', '\\cap': '교집합', '\\setminus': '차집합', '\\sqcup': '서로소 합집합', '\\triangle': '대칭차', '\\circ': '합성', '!': '팩토리얼' }),
  negative: '마이너스',
  positive: '양의',
  relations: aliases<Relation>({
    '=': (l, r) => `${josa(l, '은', '는')} ${r}`,
    '\\neq': (l, r) => `${josa(l, '은', '는')} ${josa(r, '과', '와')} 같지 않음`,
    '<': (l, r) => `${josa(l, '은', '는')} ${r}보다 작음`,
    '>': (l, r) => `${josa(l, '은', '는')} ${r}보다 큼`,
    '\\ll': (l, r) => `${josa(l, '은', '는')} ${r}보다 훨씬 작음`,
    '\\gg': (l, r) => `${josa(l, '은', '는')} ${r}보다 훨씬 큼`,
    '\\leq': (l, r) => `${josa(l, '은', '는')} ${r}보다 작거나 같음`,
    '\\geq': (l, r) => `${josa(l, '은', '는')} ${r}보다 크거나 같음`,
    '\\approx': (l, r) => `${josa(l, '은', '는')} 약 ${r}`,
    // 합동 is a congruence modulo n, see `congruent`. Alone, `\\equiv` is an identity.
    '\\equiv': (l, r) => `${josa(l, '은', '는')} ${josa(r, '과', '와')} 항등적으로 같음`,
    '\\perp': (l, r) => `${josa(l, '은', '는')} ${r}에 수직`,
    '\\parallel': (l, r) => `${josa(l, '은', '는')} ${josa(r, '과', '와')} 평행`,
    '\\in': (l, r) => `${josa(l, '은', '는')} ${r}의 원소`,
    '\\notin': (l, r) => `${josa(l, '은', '는')} ${r}의 원소가 아님`,
    '\\ni': (l, r) => `${josa(l, '은', '는')} ${josa(r, '을', '를')} 원소로 가짐`,
    '\\subseteq': (l, r) => `${josa(l, '은', '는')} ${r}의 부분집합`,
    // A Korean textbook writes ⊂ for a subset, not a proper one.
    '\\subset': (l, r) => `${josa(l, '은', '는')} ${r}의 부분집합`,
    '\\supseteq': (l, r) => `${josa(l, '은', '는')} ${josa(r, '을', '를')} 포함`,
    '\\supset': (l, r) => `${josa(l, '은', '는')} ${josa(r, '을', '를')} 진포함`,
    '\\nsubseteq': (l, r) => `${josa(l, '은', '는')} ${r}의 부분집합이 아님`,
    '\\nsupseteq': (l, r) => `${josa(l, '은', '는')} ${josa(r, '을', '를')} 포함하지 않음`,
    '\\sim': (l, r) => `${josa(l, '과', '와')} ${josa(r, '은', '는')} 닮음`,
    '\\cong': (l, r) => `${josa(l, '과', '와')} ${josa(r, '은', '는')} 합동`,
    '\\to': (l, r) => `${josa(l, '이', '가')} ${josa(r, '으로', '로')} 감`,
    '\\mapsto': (l, r) => `${josa(l, '을', '를')} ${josa(r, '으로', '로')} 대응`,
    '\\Rightarrow': (l, r) => `${l} 이면 ${r}`,
    '\\Leftrightarrow': (l, r) => `${josa(l, '은', '는')} ${josa(r, '과', '와')} 동치`,
    '\\propto': (l, r) => `${josa(l, '은', '는')} ${r}에 비례`,
    '\\gtrsim': (l, r) => `${josa(l, '은', '는')} ${r}보다 크거나 비슷함`,
    '\\lesssim': (l, r) => `${josa(l, '은', '는')} ${r}보다 작거나 비슷함`,
    '\\mid': (l, r) => `${josa(l, '은', '는')} ${r}의 약수`,
    '\\nmid': (l, r) => `${josa(l, '은', '는')} ${r}의 약수가 아님`,
    '\\vdash': (l, r) => `${l}에서 ${josa(r, '이', '가')} 유도됨`,
    '\\coloneqq': (l, r) => `${josa(l, '은', '는')} ${josa(r, '으로', '로')} 정의됨`,
  }),
  // The denominator comes first, so a power on the numerator can bind to the whole fraction: 6 분의 파이 제곱.
  fraction: (n, d, shape) => shape.numerator === 'compound' || shape.denominator === 'compound' || shape.numerator === 'scripted' || shape.followsOperator
    ? `분자가 ${n}, 분모가 ${d}인 분수`
    : `${d} 분의 ${n}`,
  // 이계 is the Korean word for the second order, as in 이계 도함수.
  derivative: (v, body, order) => `${josa(body, '을', '를')} ${v}에 대해 ${order ? `${spellNumber(order, 'ko')}계 ` : ''}미분한 것`,
  power: (b, e) => `${b}의 ${e} 제곱`,
  squared: b => `${b} 제곱`,
  cubed: b => `${b} 세제곱`,
  degrees: b => `${b}도`,
  prime: b => `${b} 프라임`,
  superscript: (b, m) => `${b} 위첨자 ${m}`,
  marks: { '\\ast': '스타', '\\dagger': '대거', '\\vee': '쌍대' },
  // A simple call keeps the reading of a product, as `f(x)` reads 에프 엑스. A grouped call says its parentheses.
  apply: (f, args, grouped, decorated) => grouped || decorated ? `${f} 괄호 ${args.join(', ')} 괄호 닫고` : joinSpaced([f, ...args]),
  upTo: x => `${x}까지`,
  range: (from, to) => `${from}부터 ${to}까지`,
  // Each Korean relation ends its sentence, as 에이는 비보다 작음, so a chain reads one relation for each pair. A chain
  // through an ellipsis reads its range and then the rule for neighbours.
  chain: (operands, relations) => {
    if (operands.includes(undefined) && relations.every(relation => relation === relations[0]))
      return `${operands[0]}부터 ${operands.at(-1)}까지, ${relations[0]!('앞의 값', '다음 값')}`
    return relations.map((relation, index) => relation(operands[index] ?? '', operands[index + 1] ?? '')).join(', 그리고 ')
  },
  placeholder: '점',
  // Korean keeps 아래첨자 also for a number: in 엘 이와, the number 이 is heard as part of the particle, as 엘과.
  numberIndex: (b, i) => `${b} 아래첨자 ${i}`,
  index: (b, i) => `${b} 아래첨자 ${i}`,
  subscript: (b, s) => `${b} 아래첨자 ${s}`,
  // A compound radicand takes 괄호, as a compound group does, so 루트 엑스 더하기 일 is only `\sqrt{x}+1`.
  ordinal: value => `${value}번째`,
  given: (event, condition) => `${josa(condition, '이', '가')} 주어졌을 때 ${event}`,
  modulo: m => `법 ${m}`,
  congruent: (l, r, m) => `${josa(l, '과', '와')} ${josa(r, '은', '는')} 법 ${m}에 대해 합동`,
  inverse: name => `${name}의 역함수`,
  root: (x, n, compound) => n === undefined ? (compound ? `루트 괄호 ${x} 괄호 닫고` : `루트 ${x}`) : n === '삼' ? `${x}의 세제곱근` : `${x}의 ${n} 제곱근`,
  limit: (body, v, t, c, side) => {
    if (v !== undefined && t !== undefined)
      return `${josa(v, '이', '가')} ${side ? `${side === 'right' ? '오른쪽' : '왼쪽'}에서 ` : ''}${josa(t, '으로', '로')} 갈 때 ${body}의 극한`
    return c ? `${c}일 때 ${body}의 극한` : `${body}의 극한`
  },
  norm: (x, index, squared) => `${x ? `${x}의 ` : ''}${index ? `${index} ` : ''}노름${squared ? '의 제곱' : ''}`,
  statistic: (kind, body, condition) => {
    const noun = { Expectation: '기댓값', Probability: '확률', Variance: '분산', Covariance: '공분산' }[kind]
    return condition ? `${condition}에 대한 ${body}의 ${noun}` : `${body}의 ${noun}`
  },
  about: x => `약 ${x}`,
  distributed: (x, d) => `${josa(x, '이', '가')} ${josa(d, '을', '를')} 따름`,
  arrow: (l, r) => `${l}에서 ${josa(r, '으로', '로')}`,
  ceil: x => `${x}의 올림`,
  floor: x => `${x}의 내림`,
  tuple: items => `순서쌍 ${items.join(', ')}`,
  bracket: x => `대괄호 ${x} 대괄호 닫고`,
  mapping: (f, from, to) => `${josa(f, '은', '는')} ${from}에서 ${josa(to, '으로', '로')}의 함수`,
  bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
    const noun = { sum: '합', prod: '곱', int: improper ? '이상적분' : '적분', union: '합집합', intersection: '교집합' }[kind]
    if (kind === 'int')
      return from !== undefined || to !== undefined ? `${from ?? ''}부터 ${to ?? ''}까지 ${body}의 ${noun}` : `${body}의 ${noun}`
    if (variable !== undefined && from !== undefined)
      return `${josa(variable, '이', '가')} ${from}부터 ${to ?? '무한대'}까지 ${body}의 ${noun}`
    return condition ? `${condition}에 대한 ${body}의 ${noun}` : `${body}의 ${noun}`
  },
  absolute: x => `${x}의 절댓값`,
  quantity: x => `괄호 ${x} 괄호 닫고`,
  set: (x, c) => c ? `${x}의 집합 단 ${c}` : `집합 ${x}`,
  interval: (a, b, { left, right }) => {
    if (left === right)
      return `${a}부터 ${b}까지의 ${left ? '닫힌구간' : '열린구간'}`
    return left ? `${a} 이상 ${b} 미만인 구간` : `${a} 초과 ${b} 이하인 구간`
  },
  complement: (set, universe) => universe ? `${universe}에 대한 ${set}의 여집합` : `${set}의 여집합`,
  powerSet: set => `${set}의 멱집합`,
  cardinality: set => `${set}의 원소의 개수`,
  percent: n => `${n} 퍼센트`,
  accent: {
    ket: b => `켓 ${b}`,
    bra: b => `브라 ${b}`,
    overline: b => `${b} 바`,
    bar: b => `${b} 바`,
    vec: b => `벡터 ${b}`,
    overrightarrow: b => `벡터 ${b}`,
    hat: b => `${b} 햇`,
    widehat: b => `${b} 햇`,
    tilde: b => `${b} 틸데`,
    dot: b => `${b} 닷`,
    overarc: b => `호 ${b}`,
    wideparen: b => `호 ${b}`,
  },
  segment: name => `선분 ${name}`,
  binomial: (n, k) => `${n} 개 중 ${k} 개를 고르는 조합`,
  unitRatio: (n, d, power) => `${n} 매 ${unitPower(power, { 2: '제곱', 3: '세제곱' })}${d}`,
  celsius: value => `섭씨 ${value}도`,
  numberSets: { 'R': '실수 전체의 집합', 'N': '자연수 전체의 집합', 'Z': '정수 전체의 집합', 'Q': '유리수 전체의 집합', 'C': '복소수 전체의 집합', 'N+': '양의 정수 전체의 집합', 'N*': '양의 정수 전체의 집합', 'Z+': '양의 정수 전체의 집합', 'Z-': '음의 정수 전체의 집합', 'Z*': '영이 아닌 정수 전체의 집합', 'R+': '양의 실수 전체의 집합', 'R-': '음의 실수 전체의 집합', 'R*': '영이 아닌 실수 전체의 집합', 'Q+': '양의 유리수 전체의 집합' },
  units: {
    prefixes: { Q: '퀘타', R: '론나', Y: '요타', Z: '제타', E: '엑사', P: '페타', T: '테라', G: '기가', M: '메가', k: '킬로', h: '헥토', da: '데카', d: '데시', c: '센티', m: '밀리', µ: '마이크로', n: '나노', p: '피코', f: '펨토', a: '아토', z: '젭토', y: '욕토', r: '론토', q: '퀙토' },
    units: { m: '미터', g: '그램', s: '초', A: '암페어', K: '켈빈', mol: '몰', cd: '칸델라', Hz: '헤르츠', N: '뉴턴', Pa: '파스칼', J: '줄', W: '와트', C: '쿨롬', V: '볼트', F: '패럿', Ω: '옴', S: '지멘스', Wb: '웨버', T: '테슬라', H: '헨리', lm: '루멘', lx: '럭스', Bq: '베크렐', Gy: '그레이', Sv: '시버트', kat: '카탈', L: '리터', l: '리터', t: '톤', eV: '전자볼트', Da: '돌턴', bar: '바', B: '바이트', bit: '비트', cal: '칼로리' },
    plain: { min: '분', h: '시간', d: '일', ha: '헥타르', au: '천문단위', Å: '옹스트롬', atm: '기압', Rt: '직각', dB: '데시벨', ft: '피트', mi: '마일' },
    power: (words, power) => `${power === '2' ? '제곱' : '세제곱'}${words}`,
  },
}
