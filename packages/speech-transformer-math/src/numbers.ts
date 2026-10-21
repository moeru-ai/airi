/**
 * Spells numbers as words, so a TTS voice cannot read a digit in another language.
 *
 * A voice of one language can read a bare digit in its own language. For example, a Chinese voice read the `1` of
 * `1 over 2` as `yī`, which an English listener hears as "E". Words of the target language leave no such choice.
 * Japanese uses kana, because a kanji numeral such as 五十 can still be read in Chinese.
 */

/** Integers with more digits than this are read digit by digit, as a code or an identifier is. */
const maxGroupedDigits = 12

const enOnes = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const enTens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const enScales = ['', 'thousand', 'million', 'billion']

function enBelowThousand(value: number): string {
  const words: string[] = []
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  if (hundreds > 0)
    words.push(`${enOnes[hundreds]} hundred`)
  if (rest >= 20)
    words.push(rest % 10 === 0 ? enTens[Math.floor(rest / 10)]! : `${enTens[Math.floor(rest / 10)]}-${enOnes[rest % 10]}`)
  else if (rest > 0)
    words.push(enOnes[rest]!)
  return words.join(' ')
}

function enInteger(digits: string): string {
  const value = Number(digits)
  if (value === 0)
    return 'zero'
  const words: string[] = []
  for (let scale = enScales.length - 1; scale >= 0; scale--) {
    const group = Math.floor(value / 1000 ** scale) % 1000
    if (group > 0)
      words.push([enBelowThousand(group), enScales[scale]].filter(Boolean).join(' '))
  }
  return words.join(' ')
}

const jaDigits = ['ゼロ', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう']
/** Rendaku and gemination of 百 and 千, for example さんびゃく and はっせん. */
const jaHundreds = ['', 'ひゃく', 'にひゃく', 'さんびゃく', 'よんひゃく', 'ごひゃく', 'ろっぴゃく', 'ななひゃく', 'はっぴゃく', 'きゅうひゃく']
const jaThousands = ['', 'せん', 'にせん', 'さんぜん', 'よんせん', 'ごせん', 'ろくせん', 'ななせん', 'はっせん', 'きゅうせん']
const jaScales = ['', 'まん', 'おく']

function jaBelowTenThousand(value: number): string {
  const thousands = Math.floor(value / 1000)
  const hundreds = Math.floor(value / 100) % 10
  const tens = Math.floor(value / 10) % 10
  const ones = value % 10
  return [
    jaThousands[thousands],
    jaHundreds[hundreds],
    tens === 0 ? '' : tens === 1 ? 'じゅう' : `${jaDigits[tens]}じゅう`,
    ones === 0 ? '' : jaDigits[ones],
  ].join('')
}

function jaInteger(digits: string): string {
  const value = Number(digits)
  if (value === 0)
    return jaDigits[0]!
  let result = ''
  for (let scale = jaScales.length - 1; scale >= 0; scale--) {
    const group = Math.floor(value / 10000 ** scale) % 10000
    if (group === 0)
      continue
    // 一万 is いちまん, but 千 is せん without いち. Before 万 and 億, 一千 is いっせん: 一千万 is いっせんまん.
    const thousand = scale > 0 && Math.floor(group / 1000) === 1 ? 'いっ' : ''
    result += (scale > 0 && group === 1 ? 'いち' : thousand + jaBelowTenThousand(group)) + jaScales[scale]
  }
  return result
}

const koDigits = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
const koScales = ['', '만', '억']

function koBelowTenThousand(value: number): string {
  const parts = [[Math.floor(value / 1000), '천'], [Math.floor(value / 100) % 10, '백'], [Math.floor(value / 10) % 10, '십']] as const
  // Sino-Korean drops 일 before 십, 백, and 천: 십이, not 일십이.
  const prefix = parts.map(([count, unit]) => count === 0 ? '' : `${count === 1 ? '' : koDigits[count]}${unit}`).join('')
  const ones = value % 10
  return prefix + (ones === 0 ? '' : koDigits[ones])
}

function koInteger(digits: string): string {
  const value = Number(digits)
  if (value === 0)
    return koDigits[0]!
  let result = ''
  for (let scale = koScales.length - 1; scale >= 0; scale--) {
    const group = Math.floor(value / 10000 ** scale) % 10000
    if (group === 0)
      continue
    // 만 alone is 10000, without 일.
    result += (scale === 1 && group === 1 ? '' : koBelowTenThousand(group)) + koScales[scale]
  }
  return result
}

/** The languages that spell numbers. Chinese keeps digits, because Chinese voices read them as Chinese already. */
export type NumberLanguage = 'en' | 'ja' | 'ko'

const spellers: Readonly<Record<NumberLanguage, { integer: (digits: string) => string, digit: readonly string[], point: (integer: string, fraction: string) => string }>> = {
  en: { integer: enInteger, digit: enOnes.slice(0, 10), point: (i, f) => `${i} point ${f}` },
  ja: { integer: jaInteger, digit: jaDigits, point: (i, f) => `${i}てん${f}` },
  ko: { integer: koInteger, digit: koDigits, point: (i, f) => `${i} 점 ${f}` },
}

/**
 * Spells a decimal number as words. Digits after the point are read one by one, as people read them.
 * A number with grouping commas is read as its value. A very long integer is read digit by digit.
 *
 * @example
 * spellNumber('1,200', 'en')
 * // => 'one thousand two hundred'
 * spellNumber('3.14', 'ja')
 * // => 'さんてんいちよん'
 * spellNumber('14', 'ko')
 * // => '십사'
 */
export function spellNumber(source: string, language: NumberLanguage): string {
  const speller = spellers[language]
  const [integer = '', fraction] = source.replaceAll(',', '').split('.')
  // English digits are words, so they need spaces. Kana and hangul digits are one syllable each and join, as 일사.
  const byDigit = (digits: string) => [...digits].map(digit => speller.digit[Number(digit)]).join(language === 'en' ? ' ' : '')
  // A leading zero, as `007`, is a code or a label, so its digits are read one by one and the zeros stay.
  const whole = integer.length > maxGroupedDigits || /^0\d/.test(integer) ? byDigit(integer) : speller.integer(integer || '0')
  return fraction === undefined ? whole : speller.point(whole, byDigit(fraction))
}
