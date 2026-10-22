import { describe, expect, it } from 'vitest'

import { MathSpeech } from '../speech'

const speech = new MathSpeech()
const basel = String.raw`\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{\pi^2}{6}`

describe('speakMath', () => {
  it('reads the Basel sum', () => {
    expect(speech.speak(basel, 'ja')).toBe('エヌを無限大に近づけたときのアイがいちからエヌまでのアイの二乗分のいちの和の極限 イコール 分子がパイの二乗、分母がろくの分数')
  })

  it.each([
    [String.raw`AB \perp CD`, 'エービーとシーディーは垂直'],
    [String.raw`l_1 \parallel l_2`, 'エルいちとエルには平行'],
    [String.raw`a \leq b`, 'エー 小なりイコール ビー'],
    [String.raw`x \in A`, 'エックスはエーに属する'],
    [String.raw`A \subseteq B`, 'エーはビーに含まれる'],
    [String.raw`\angle ABC = 90^\circ`, '角エービーシー イコール きゅうじゅう度'],
    [String.raw`\triangle ABC \sim \triangle DEF`, '三角形エービーシーと三角形ディーイーエフは相似'],
    [String.raw`(a+b)^2`, 'かっこエープラスビーかっことじの二乗'],
    [String.raw`\sqrt[3]{8} = 2`, 'はちのさん乗根 イコール に'],
    [String.raw`|x| \geq 0`, 'エックスの絶対値 大なりイコール ゼロ'],
    [String.raw`\int_0^1 x^2 dx`, 'ゼロからいちまでのエックスの二乗ディーエックスの積分'],
    [String.raw`-x^{-1}`, 'マイナスエックスのマイナスいち乗'],
    [String.raw`50\%`, 'ごじゅうパーセント'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })

  it.each([
    [String.raw`t \in [0,1]`, 'ティーはゼロからいちまでの閉区間に属する'],
    [String.raw`x \in (0,1)`, 'エックスはゼロからいちまでの開区間に属する'],
    [String.raw`x \in [0, 1)`, 'エックスはゼロ以上いち未満の区間に属する'],
    [String.raw`x \in \left(0, 1\right]`, 'エックスはゼロより大きくいち以下の区間に属する'],
  ])('reads the interval %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })

  it('reads an integral with an infinite bound as an improper integral', () => {
    const tex = String.raw`\int_0^{+\infty} e^{-x}\,dx`
    expect(speech.speak(tex, 'ja')).toBe('ゼロからプラス無限大までのイーのマイナスエックス乗ディーエックスの広義積分')
  })

  it.each([
    [String.raw`A \setminus B`, 'エーマイナスビー'],
    [String.raw`A \triangle B`, 'エー対称差ビー'],
    [String.raw`A \sqcup B`, 'エー直和ビー'],
    [String.raw`A^c`, 'エーの補集合'],
    [String.raw`A^{\complement}`, 'エーの補集合'],
    [String.raw`\complement_U A`, 'ユーにおけるエーの補集合'],
    [String.raw`\mathcal{P}(A)`, 'エーの冪集合'],
    [String.raw`\#A`, 'エーの要素の個数'],
    [String.raw`\operatorname{card}(A)`, 'エーの要素の個数'],
    [String.raw`A \ni x`, 'エーはエックスを要素に持つ'],
    [String.raw`A \supsetneq B`, 'エーはビーを真に含む'],
    [String.raw`A \nsubseteq B`, 'エーはビーに含まれない'],
    [String.raw`\nexists x`, '存在しないエックス'],
    [String.raw`a \ll b`, 'エーはビーよりずっと小さい'],
    [String.raw`a \gg b`, 'エーはビーよりずっと大きい'],
  ])('reads the set notation %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it('spells numbers in English, Japanese, and Korean, and keeps Chinese digits', () => {
    const tex = String.raw`\frac{1}{2}+\frac{1}{3}=\frac{5}{6}`
    expect(speech.speak(tex, 'ja')).toBe('に分のいちプラスさん分のいち イコール ろく分のご')
  })

  it.each([
    [String.raw`a \in A`, '小文字のエーは大文字のエーに属する'],
    [String.raw`\Omega \neq \omega`, '大文字のオメガ ノットイコール 小文字のオメガ'],
  ])('says the case of a letter that %s uses in both cases', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })

  it.each([
    [String.raw`9.8\,\mathrm{m/s^2}`, 'きゅうてんはちメートル毎平方秒'],
    [String.raw`3\times10^{8}\,\mathrm{m/s}`, 'さんかけるじゅうのはち乗メートル毎秒'],
    [String.raw`25^\circ\mathrm{C}`, '摂氏にじゅうご度'],
    [String.raw`5\,\mathrm{kg}`, 'ごキログラム'],
  ])('reads the unit of %s as words', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })

  it.each([
    // A compound part names the numerator and the denominator, so the listener knows where each one ends.
    [String.raw`\frac{1}{1+\frac{1}{x}}`, '分子がいち、分母がいちプラス分子がいち、分母がエックスの分数の分数'],
    [String.raw`\frac{f-1}{2}`, '分子がエフマイナスいち、分母がにの分数'],
    // A power after the second-read part could bind to the whole fraction, so it names both parts too.
    [String.raw`\frac{\pi^2}{6}`, '分子がパイの二乗、分母がろくの分数'],
    [String.raw`\frac{6}{\pi^2}`, 'パイの二乗分のろく'],
  ])('reads the fraction %s with clear bounds', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})

describe('readings of the review', () => {
  it.each([
    // The subscript of a name runs into its argument without かっこ: キュー下付きエムティー.
    [String.raw`q_m(t)`, 'キュー下付きエムかっこティーかっことじ'],
    [String.raw`x_1, x_2, \dots, x_n`, 'エックスいち、エックスにからエックス下付きエヌまで'],
    [String.raw`k = 1, \dots, d`, 'ケー イコール いちからディーまで'],
    // かっこ shows where a compound radicand ends, so the two formulas below sound different.
    [String.raw`\sqrt{x+1}`, 'ルートかっこエックスプラスいちかっことじ'],
    [String.raw`\sqrt{x}+1`, 'ルートエックスプラスいち'],
    [String.raw`\{x \mid x > 0\}`, 'エックス 大なり ゼロ を満たすエックスの集合'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})

describe('readings of the second review', () => {
  it.each([
    [String.raw`f(x)=\begin{cases}1 & x>0\\0 & \text{otherwise}\end{cases}`, 'エフエックス イコール エックス 大なり ゼロのときいち、それ以外のときゼロ'],
    [String.raw`\frac{d^2 y}{dx^2}`, 'ワイをエックスでに回微分したもの'],
    [String.raw`f^{-1}(x)`, 'エフの逆関数かっこエックスかっことじ'],
    // A speed is 毎時. 時間 is a duration.
    [String.raw`100\,\mathrm{km/h}`, 'ひゃくキロメートル毎時'],
    // 一千万 is いっせんまん.
    [String.raw`10000000`, 'いっせんまん'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})

describe('mappings of the review', () => {
  it.each([
    [String.raw`\mathbb{E}[X \mid Y]`, 'ワイのもとでのエックスの期待値'],
    // 合同 is a congruence modulo n. Alone, `\equiv` is an identity.
    [String.raw`a \equiv b \pmod{n}`, 'エーとビーはエヌを法として合同'],
    [String.raw`f(x) \equiv 0`, 'エフエックスはゼロと恒等的に等しい'],
    [String.raw`A \subset B`, 'エーはビーに含まれる'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})

describe('readings of the eval review', () => {
  it.each([
    // 以下同様 inside a chain was heard as 以下, which means less than or equal.
    [String.raw`x_1 \leq \cdots \leq x_n`, 'エックスいちからエックス下付きエヌまで、前の値 小なりイコール 次の値'],
    [String.raw`a < b < c`, 'エー 小なり ビー 小なり シー'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})
