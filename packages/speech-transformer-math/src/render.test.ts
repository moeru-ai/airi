import type { MathJson } from '@proj-airi/mathjson'

import { describe, expect, it } from 'vitest'

import { renderMath } from './render'
import { MathSpeech } from './speech'

const speech = new MathSpeech()
const num = (value: string): MathJson => ({ num: value })

describe('renderMath', () => {
  it('reads a call with "of" in English, and with parentheses when it is grouped', () => {
    expect(renderMath(['Apply', 'f', 'x'], speech.locale('en'))).toBe('f of x')
    expect(renderMath(['Apply', 'f', ['Add', 'x', num('1')]], speech.locale('en'))).toBe('f of the quantity x plus one')
    expect(renderMath(['Apply', 'f', 'x', 'y'], speech.locale('en'))).toBe('f of x, y')
    // A simple call keeps the reading of the product in Chinese, Japanese, and Korean.
    expect(renderMath(['Apply', 'f', 'x'], speech.locale('zh'))).toBe('f x')
    expect(renderMath(['Apply', 'f', 'x', 'y'], speech.locale('zh'))).toBe('f关于x和y')
    expect(renderMath(['Apply', 'f', 'x', 'y'], speech.locale('ja'))).toBe('エフかっこエックス、ワイかっことじ')
    expect(renderMath(['Apply', 'f', 'x', 'y'], speech.locale('ko'))).toBe('에프 괄호 엑스, 와이 괄호 닫고')
    expect(renderMath(['Apply', 'p', ['Placeholder']], speech.locale('en'))).toBe('p of dot')
  })

  it('reads a sequence with pauses and a superscript mark', () => {
    expect(renderMath(['Sequence', 'r', 's'], speech.locale('en'))).toBe('r, s')
    expect(renderMath(['Superscript', ['NumberSet', 'N'], '+'], speech.locale('en'))).toBe('the natural numbers plus')
    expect(renderMath(['Superscript', 'f', ['Delimiter', 'n']], speech.locale('en'))).toBe('f n')
  })

  it('reads an expectation with its conditions as one list', () => {
    const loss: MathJson = ['Expectation', ['Power', ['Norm', ['Subtract', 'v', 'u']], num('2')], ['Clauses', ['Distributed', 't', 'q'], ['Distributed', 'x', 'p']]]
    expect(renderMath(loss, speech.locale('en'))).toBe('the expected value, over t drawn from q, x drawn from p, of the squared norm of the difference between v and u')
    expect(renderMath(loss, speech.locale('zh'))).toBe('在t服从q、x服从p下 v减u的范数的平方的期望')
    expect(renderMath(loss, speech.locale('ja'))).toBe('ティーがキューに従う、エックスがピーに従うとしたときのブイマイナスユーのノルムの二乗の期待値')
  })

  it('says the case of a letter only when the formula has both cases of it', () => {
    // A lone capital is clear, so `\Sigma` reads as sigma, as `S` reads as S.
    expect(renderMath(['Element', 'r', '\\Sigma'], speech.locale('en'))).toBe('r is an element of sigma')
    expect(renderMath(['Element', 'r', 'S'], speech.locale('en'))).toBe('r is an element of S')
    // A Chinese teacher says 大A and 小a for a Latin letter, and keeps 大写 for a Greek name.
    expect(renderMath(['Element', 'a', 'A'], speech.locale('zh'))).toBe('小a 属于 大A')
  })

  it('reads each head with the words of the language', () => {
    const expression: MathJson = ['Equal', ['Add', 'a', num('1')], 'b']
    expect(renderMath(expression, speech.locale('zh'))).toBe('a加1 等于 b')
    expect(renderMath(expression, speech.locale('en'))).toBe('a plus one equals b')
    expect(renderMath(expression, speech.locale('ja'))).toBe('エープラスいち イコール ビー')
    expect(renderMath(expression, speech.locale('ko'))).toBe('에이 더하기 일은 비')
  })

  it('chooses the fraction reading by the shape of its parts', () => {
    expect(renderMath(['Divide', num('1'), num('2')], speech.locale('en'))).toBe('one over two')
    expect(renderMath(['Divide', ['Subtract', 'f', num('1')], num('2')], speech.locale('en'))).toBe('the fraction with numerator f minus one and denominator two')
    // After an operator, a non-numeric denominator names its parts in a language that reads the denominator first.
    expect(renderMath(['Add', num('1'), ['Divide', num('1'), 'x']], speech.locale('ja'))).toBe('いちプラス分子がいち、分母がエックスの分数')
    expect(renderMath(['Add', num('1'), ['Divide', num('1'), num('3')]], speech.locale('ja'))).toBe('いちプラスさん分のいち')
  })

  it('says a group only where lowering made it a group', () => {
    expect(renderMath(['Delimiter', ['Add', 'a', 'b']], speech.locale('en'))).toBe('a plus b')
    expect(renderMath(['Power', ['Group', ['Add', 'a', 'b']], num('2')], speech.locale('en'))).toBe('the square of the quantity a plus b')
  })

  it('says the case of a letter only when the expression has both cases of it', () => {
    expect(renderMath(['Equal', 'N', ['Add', 'n', num('1')]], speech.locale('en'))).toBe('capital N equals n plus one')
    expect(renderMath(['Equal', 'N', 'm'], speech.locale('en'))).toBe('N equals m')
  })

  it('reads limits, units, segments, and an operator without operands', () => {
    expect(renderMath(['Limit', 'f', ['Bounds', 'x', num('0'), num('-1')]], speech.locale('en'))).toBe('the limit as x approaches zero from the left of f')
    expect(renderMath(['Unit', '\'km\'', '\'h\''], speech.locale('zh'))).toBe('千米每小时')
    expect(renderMath(['Segment', 'A', 'B'], speech.locale('zh'))).toBe('线段A B')
    expect(renderMath(['InvisibleOperator', num('1'), '+'], speech.locale('en'))).toBe('one plus')
  })
})
