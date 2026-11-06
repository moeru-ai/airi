import { describe, expect, it } from 'vitest'

import { josa } from '../locale'
import { MathSpeech } from '../speech'

const speech = new MathSpeech()
const basel = String.raw`\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{\pi^2}{6}`

describe('speakMath', () => {
  it('reads the Basel sum', () => {
    expect(speech.speak(basel, 'ko')).toBe('엔이 무한대로 갈 때 아이가 일부터 엔까지 아이 제곱 분의 일의 합의 극한은 분자가 파이 제곱, 분모가 육인 분수')
  })

  it.each([
    [String.raw`AB \perp CD`, '에이 비는 씨 디에 수직'],
    [String.raw`l_1 \parallel l_2`, '엘 아래첨자 일은 엘 아래첨자 이와 평행'],
    [String.raw`a \leq b`, '에이는 비보다 작거나 같음'],
    [String.raw`x \in A`, '엑스는 에이의 원소'],
    [String.raw`A \subseteq B`, '에이는 비의 부분집합'],
    [String.raw`\angle ABC = 90^\circ`, '각 에이 비 씨는 구십도'],
    [String.raw`\triangle ABC \sim \triangle DEF`, '삼각형 에이 비 씨와 삼각형 디 E 에프는 닮음'],
    [String.raw`(a+b)^2`, '괄호 에이 더하기 비 괄호 닫고 제곱'],
    [String.raw`\sqrt[3]{8} = 2`, '팔의 세제곱근은 이'],
    [String.raw`|x| \geq 0`, '엑스의 절댓값은 영보다 크거나 같음'],
    [String.raw`\int_0^1 x^2 dx`, '영부터 일까지 엑스 제곱 디 엑스의 적분'],
    [String.raw`-x^{-1}`, '마이너스 엑스의 마이너스 일 제곱'],
    [String.raw`50\%`, '오십 퍼센트'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })

  it.each([
    [String.raw`t \in [0,1]`, '티는 영부터 일까지의 닫힌구간의 원소'],
    [String.raw`x \in (0,1)`, '엑스는 영부터 일까지의 열린구간의 원소'],
    [String.raw`x \in [0, 1)`, '엑스는 영 이상 일 미만인 구간의 원소'],
    [String.raw`x \in \left(0, 1\right]`, '엑스는 영 초과 일 이하인 구간의 원소'],
  ])('reads the interval %s', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })

  it('reads an integral with an infinite bound as an improper integral', () => {
    const tex = String.raw`\int_0^{+\infty} e^{-x}\,dx`
    // e keeps its Latin form in Korean, because its name 이 is also the number 2.
    expect(speech.speak(tex, 'ko')).toBe('영부터 양의 무한대까지 e의 마이너스 엑스 제곱 디 엑스의 이상적분')
  })

  it.each([
    [String.raw`A \setminus B`, '에이 차집합 비'],
    [String.raw`A \triangle B`, '에이 대칭차 비'],
    [String.raw`A \sqcup B`, '에이 서로소 합집합 비'],
    [String.raw`A^c`, '에이의 여집합'],
    [String.raw`A^{\complement}`, '에이의 여집합'],
    [String.raw`\complement_U A`, '유에 대한 에이의 여집합'],
    [String.raw`\mathcal{P}(A)`, '에이의 멱집합'],
    [String.raw`\#A`, '에이의 원소의 개수'],
    [String.raw`\operatorname{card}(A)`, '에이의 원소의 개수'],
    [String.raw`A \ni x`, '에이는 엑스를 원소로 가짐'],
    [String.raw`A \supsetneq B`, '에이는 비를 진포함'],
    [String.raw`A \nsubseteq B`, '에이는 비의 부분집합이 아님'],
    [String.raw`\nexists x`, '존재하지 않는 엑스'],
    [String.raw`a \ll b`, '에이는 비보다 훨씬 작음'],
    [String.raw`a \gg b`, '에이는 비보다 훨씬 큼'],
  ])('reads the set notation %s', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it('spells numbers in English, Japanese, and Korean, and keeps Chinese digits', () => {
    const tex = String.raw`\frac{1}{2}+\frac{1}{3}=\frac{5}{6}`
    expect(speech.speak(tex, 'ko')).toBe('이 분의 일 더하기 삼 분의 일은 육 분의 오')
  })

  it.each([
    [String.raw`a \in A`, '소문자 에이는 대문자 에이의 원소'],
    [String.raw`\Omega \neq \omega`, '대문자 오메가는 소문자 오메가와 같지 않음'],
  ])('says the case of a letter that %s uses in both cases', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })

  it('keeps the case unsaid when each letter has one case', () => {
    expect(speech.speak('F=ma', 'ko')).toBe('에프는 엠 에이')
  })

  it.each([
    [String.raw`9.8\,\mathrm{m/s^2}`, '구 점 팔 미터 매 제곱초'],
    [String.raw`3\times10^{8}\,\mathrm{m/s}`, '삼 곱하기 십의 팔 제곱 미터 매 초'],
    [String.raw`25^\circ\mathrm{C}`, '섭씨 이십오도'],
    [String.raw`5\,\mathrm{kg}`, '오 킬로그램'],
  ])('reads the unit of %s as words', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })

  it.each([
    // A compound part names the numerator and the denominator, so the listener knows where each one ends.
    [String.raw`\frac{1}{1+\frac{1}{x}}`, '분자가 일, 분모가 일 더하기 분자가 일, 분모가 엑스인 분수인 분수'],
    [String.raw`\frac{f-1}{2}`, '분자가 에프 빼기 일, 분모가 이인 분수'],
    // A power after the second-read part could bind to the whole fraction, so it names both parts too.
    [String.raw`\frac{\pi^2}{6}`, '분자가 파이 제곱, 분모가 육인 분수'],
    [String.raw`\frac{6}{\pi^2}`, '파이 제곱 분의 육'],
  ])('reads the fraction %s with clear bounds', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })
})

describe('josa', () => {
  it('adds Korean particles by the final sound', () => {
    expect(josa('극한', '은', '는')).toBe('극한은')
    expect(josa('파이', '은', '는')).toBe('파이는')
    expect(josa('n', '이', '가')).toBe('n이')
    expect(josa('i', '이', '가')).toBe('i가')
    expect(josa('6', '은', '는')).toBe('6은')
    expect(josa('2', '은', '는')).toBe('2는')
    expect(josa('무한대', '으로', '로')).toBe('무한대로')
    expect(josa('l', '으로', '로')).toBe('l로')
    expect(josa('n', '으로', '로')).toBe('n으로')
  })
})

describe('readings of the review', () => {
  it.each([
    // The subscript of a name runs into its argument without 괄호: 큐 아래첨자 엠 티.
    [String.raw`q_m(t)`, '큐 아래첨자 엠 괄호 티 괄호 닫고'],
    [String.raw`x_1, x_2, \dots, x_n`, '엑스 아래첨자 일, 엑스 아래첨자 이부터 엑스 아래첨자 엔까지'],
    [String.raw`k = 1, \dots, d`, '케이는 일부터 디까지'],
    [String.raw`\sqrt{x+1}`, '루트 괄호 엑스 더하기 일 괄호 닫고'],
    [String.raw`\sqrt{x}+1`, '루트 엑스 더하기 일'],
    // A Korean relation ends its sentence, so a chain reads one relation for each pair, not 비보다 작음은.
    [String.raw`a < b < c`, '에이는 비보다 작음, 그리고 비는 씨보다 작음'],
    [String.raw`0 < x \leq 1`, '영은 엑스보다 작음, 그리고 엑스는 일보다 작거나 같음'],
    [String.raw`x_1 \leq \cdots \leq x_n`, '엑스 아래첨자 일부터 엑스 아래첨자 엔까지, 앞의 값은 다음 값보다 작거나 같음'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })
})

describe('readings of the second review', () => {
  it.each([
    [String.raw`f(x)=\begin{cases}1 & x>0\\0 & \text{otherwise}\end{cases}`, '에프 엑스는 일, 단 엑스는 영보다 큼; 그 외의 경우 영'],
    // 일행 sounds like the number one, so the rows are 첫째 and 둘째.
    [String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`, '행렬, 첫째 행 일, 이, 둘째 행 삼, 사'],
    [String.raw`\frac{d^2 y}{dx^2}`, '와이를 엑스에 대해 이계 미분한 것'],
    [String.raw`\begin{aligned}a&=b\\&=c\end{aligned}`, '에이는 비, 그리고 비는 씨'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })
})

describe('mappings of the review', () => {
  it.each([
    [String.raw`\mathbb{E}[X \mid Y]`, '와이가 주어졌을 때 엑스의 기댓값'],
    [String.raw`a \equiv b \pmod{n}`, '에이와 비는 법 엔에 대해 합동'],
    // φ is 피, so it is not heard as π, 파이.
    [String.raw`\phi + \pi`, '피 더하기 파이'],
    [String.raw`A \subset B`, '에이는 비의 부분집합'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })
})
