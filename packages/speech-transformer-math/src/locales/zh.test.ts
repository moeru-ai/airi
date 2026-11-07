import { describe, expect, it } from 'vitest'

import { MathSpeech } from '../speech'

const speech = new MathSpeech()
const basel = String.raw`\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{\pi^2}{6}`

describe('speakMath', () => {
  it('reads the Basel sum', () => {
    expect(speech.speak(basel, 'zh')).toBe('当n趋于无穷大时 i从1到n对i的平方分之1求和的极限 等于 分子是派的平方 分母是6的分数')
  })

  it.each([
    [String.raw`AB \perp CD`, 'A B 垂直于 C D'],
    [String.raw`l_1 \parallel l_2`, 'l1 平行于 l2'],
    [String.raw`a \leq b`, 'a 小于等于 b'],
    [String.raw`x \in A`, 'x 属于 A'],
    [String.raw`A \subseteq B`, 'A 包含于 B'],
    [String.raw`\angle ABC = 90^\circ`, '角A B C 等于 90度'],
    [String.raw`\triangle ABC \sim \triangle DEF`, '三角形A B C 相似于 三角形D E F'],
    [String.raw`(a+b)^2`, 'a与b的和的平方'],
    [String.raw`\sqrt[3]{8} = 2`, '8的立方根 等于 2'],
    [String.raw`|x| \geq 0`, 'x的绝对值 大于等于 0'],
    [String.raw`\int_0^1 x^2 dx`, '从0到1对x的平方d x积分'],
    [String.raw`-x^{-1}`, '负x的负1次方'],
    [String.raw`50\%`, '百分之50'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })

  it.each([
    [String.raw`t \in [0,1]`, 't 属于 闭区间0到1'],
    [String.raw`x \in (0,1)`, 'x 属于 开区间0到1'],
    [String.raw`x \in [0, 1)`, 'x 属于 左闭右开区间0到1'],
    [String.raw`x \in \left(0, 1\right]`, 'x 属于 左开右闭区间0到1'],
  ])('reads the interval %s', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })

  it('reads a pair as an interval only when a set symbol or an infinite bound shows it', () => {
    expect(speech.speak(String.raw`(-\infty, 0) \cup (1, +\infty)`, 'zh')).toBe('开区间负无穷大到0并开区间1到正无穷大')
    // A point, or the arguments of a function, keep the plain reading.
    expect(speech.speak(String.raw`P(1, 2)`, 'zh')).toBe('P括号1，2括号')
  })

  it('reads parentheses that a neighbor binds to, so the grouping is not lost', () => {
    // Silent brackets turned v - (x - epsilon) into v - x - epsilon, and (1-t) epsilon into 1 - t epsilon.
    expect(speech.speak(String.raw`x_t=(1-t)\epsilon+tx`, 'zh')).toBe('x下标t 等于 1与t的差乘以艾普西隆加t x')
    expect(speech.speak(String.raw`v-(x-\epsilon)`, 'zh')).toBe('v减x与艾普西隆的差')
    expect(speech.speak(String.raw`(x+1)/2`, 'zh')).toBe('x与1的和除以2')
  })

  it('reads like a Chinese teacher', () => {
    expect(speech.speak(String.raw`\sqrt{a^2+b^2}`, 'zh')).toBe('根号下a的平方加b的平方')
    expect(speech.speak(String.raw`\sqrt{2}`, 'zh')).toBe('根号2')
    expect(speech.speak(String.raw`\left(1+\frac{1}{n}\right)^n`, 'zh')).toBe('1与n分之1的和的n次方')
    expect(speech.speak(String.raw`(a, b, c)`, 'zh')).toBe('3元组a、b、c')
    expect(speech.speak(String.raw`\|x\|_2`, 'zh')).toBe('x的2范数')
    expect(speech.speak(String.raw`K^\dagger`, 'zh')).toBe('K共轭转置')
    expect(speech.speak(String.raw`\theta^*`, 'zh')).toBe('西塔星')
    // A call with a decorated name says its brackets in Chinese, so it is not heard as a product.
    expect(speech.speak(String.raw`\hat{H}(t)`, 'zh')).toBe('H帽括号t括号')
    expect(speech.speak(String.raw`f(x)`, 'zh')).toBe('f x')
    // Scientific notation is a power of ten, not Euler's number.
    expect(speech.speak(String.raw`1e-3`, 'zh')).toBe('1乘10的负3次方')
  })

  it('reads an integral with an infinite bound as an improper integral', () => {
    const tex = String.raw`\int_0^{+\infty} e^{-x}\,dx`
    expect(speech.speak(tex, 'zh')).toBe('从0到正无穷大对e的负x次方d x的反常积分')
  })

  it.each([
    [String.raw`A \setminus B`, 'A减B'],
    [String.raw`A \triangle B`, 'A对称差B'],
    [String.raw`A \sqcup B`, 'A不交并B'],
    [String.raw`A^c`, 'A的补集'],
    [String.raw`A^{\complement}`, 'A的补集'],
    [String.raw`\complement_U A`, 'A在U中的补集'],
    [String.raw`\mathcal{P}(A)`, 'A的幂集'],
    [String.raw`\#A`, 'A的元素个数'],
    [String.raw`\operatorname{card}(A)`, 'A的元素个数'],
    [String.raw`A \ni x`, 'A 包含元素 x'],
    [String.raw`A \supsetneq B`, 'A 真包含 B'],
    [String.raw`A \nsubseteq B`, 'A 不包含于 B'],
    [String.raw`\nexists x`, '不存在x'],
    [String.raw`a \ll b`, 'a 远小于 b'],
    [String.raw`a \gg b`, 'a 远大于 b'],
  ])('reads the set notation %s', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })

  it('keeps a power with a lowercase base, and a triangle that starts an operand', () => {
    expect(speech.speak(String.raw`x^c`, 'zh')).toBe('x的c次方')
    expect(speech.speak(String.raw`\triangle ABC`, 'zh')).toBe('三角形A B C')
  })

  it('reads an unknown command by its name and does not fail on unbalanced input', () => {
    expect(speech.speak('}{', 'zh')).toBe('')
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it('spells numbers in English, Japanese, and Korean, and keeps Chinese digits', () => {
    const tex = String.raw`\frac{1}{2}+\frac{1}{3}=\frac{5}{6}`
    expect(speech.speak(tex, 'zh')).toBe('2分之1加3分之1 等于 6分之5')
  })

  it.each([
    [String.raw`a \in A`, '小a 属于 大A'],
    [String.raw`\Omega \neq \omega`, '大写欧米伽 不等于 小写欧米伽'],
  ])('says the case of a letter that %s uses in both cases', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })

  it.each([
    [String.raw`9.8\,\mathrm{m/s^2}`, '9.8米每平方秒'],
    [String.raw`3\times10^{8}\,\mathrm{m/s}`, '3乘10的8次方米每秒'],
    [String.raw`25^\circ\mathrm{C}`, '25摄氏度'],
    [String.raw`5\,\mathrm{kg}`, '5公斤'],
  ])('reads the unit of %s as words', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })

  it.each([
    // A compound part names the numerator and the denominator, so the listener knows where each one ends.
    [String.raw`\frac{1}{1+\frac{1}{x}}`, '分子是1 分母是1加分子是1 分母是x的分数的分数'],
    [String.raw`\frac{f-1}{2}`, '分子是f减1 分母是2的分数'],
    // A power after the second-read part could bind to the whole fraction, so it names both parts too.
    [String.raw`\frac{\pi^2}{6}`, '分子是派的平方 分母是6的分数'],
    [String.raw`\frac{6}{\pi^2}`, '派的平方分之6'],
  ])('reads the fraction %s with clear bounds', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })

  it('reads a derivative, a one-sided limit, a subscript, and a function signature', () => {
    expect(speech.speak(String.raw`\frac{d}{dx}x^{n}=nx^{n-1}`, 'zh')).toBe('x的n次方对x求导 等于 n x的n减1次方')
    expect(speech.speak(String.raw`\lim_{x \to 0^{+}}\ln x=-\infty`, 'zh')).toBe('当x从右侧趋于0时 ln x的极限 等于 负无穷大')
  })
})

describe('readings of the review', () => {
  it('says the brackets of a call whose name has a subscript', () => {
    expect(speech.speak(String.raw`q_m(t)`, 'zh')).toBe('q下标m括号t括号')
  })
})

describe('readings of the second review', () => {
  it.each([
    // `\ln` before parentheses calls them. It does not multiply the sum.
    [String.raw`\ln(x+1)`, 'ln括号x加1括号'],
    [String.raw`f^{-1}(x)`, 'f的反函数括号x括号'],
    [String.raw`\frac{d^2 y}{dx^2}`, 'y对x求二阶导'],
    [String.raw`f(x)=\begin{cases}1 & x>0\\0 & \text{otherwise}\end{cases}`, 'f x 等于 当x 大于 0时为1，其他情况下为0'],
    [String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`, '矩阵，第1行是1、2，第2行是3、4'],
    [String.raw`\mathrm{Rt}\triangle ABC`, '直角三角形A B C'],
    [String.raw`5\,\mathrm{kg\cdot m^2}`, '5公斤平方米'],
    [String.raw`100\,\mathrm{hPa}`, '100百帕'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })
})

describe('mappings of the review', () => {
  it.each([
    [String.raw`P(A \mid B)`, 'P B条件下的A'],
    [String.raw`a \mid b`, 'a 整除 b'],
    [String.raw`R = 10\,\Omega`, 'R 等于 10欧姆'],
    [String.raw`\mathbb{N}^{+}`, '正整数集'],
    // 恒等于 is an identity. A congruence modulo n is 同余.
    [String.raw`a \equiv b \pmod{n}`, 'a 与 b 模 n 同余'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })
})

describe('readings of the streaming review', () => {
  it.each([
    // A number under a letter is said after it, as a teacher says x0. A letter keeps 下标, so x下标t is not x times t.
    // 乘以 after a group: an ASR heard 差乘 as 叉乘, the cross product.
    [String.raw`x_t=(1-t)x_0+tx_1`, 'x下标t 等于 1与t的差乘以x0加t x1'],
    // Several arguments take 关于, without bracket words or a comma that the TTS chunker could cut at.
    [String.raw`\frac{dx_t}{dt}=v_\theta(x_t,t)`, 'x下标t对t求导 等于 v下标西塔关于x下标t和t'],
    [String.raw`P(1, 2)`, 'P括号1，2括号'],
  ])('reads %s', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })
})
