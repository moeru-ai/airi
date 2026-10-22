import { describe, expect, it } from 'vitest'

import { withoutPendingMath } from './chat-math'
import { useMarkdown } from './markdown'

describe('withoutPendingMath', () => {
  it('drops a display formula that is still open', () => {
    expect(withoutPendingMath('Speed:\n\n$$\nu_t = \\frac{dx_t}{')).toBe('Speed:\n\n')
    expect(withoutPendingMath('Speed $$u_t = \\frac{d')).toBe('Speed ')
    expect(withoutPendingMath('Speed:\n\n```latex\nu_t = \\frac{d')).toBe('Speed:\n\n')
  })

  it('keeps closed formulas, code, escaped dollars, and code fences of other languages', () => {
    const closed = 'Speed:\n\n$$\nu_t = x_1 - x_0\n$$\n\nNext.'
    expect(withoutPendingMath(closed)).toBe(closed)
    expect(withoutPendingMath('Price \\$$5 and more')).toBe('Price \\$$5 and more')
    expect(withoutPendingMath('```js\nconst a = "$$"\n')).toBe('```js\nconst a = "$$"\n')
  })

  // ROOT CAUSE:
  // remark-math reads an unclosed `$$` as a formula up to the end of the text. While the model streams, KaTeX parses the
  // half-written formula, fails, and renders it as a red error until the closing `$$` arrives.
  it('renders no KaTeX error at any streaming prefix of a reply', () => {
    const reply = '目标速度是：\n\n$$\nu_t = \\frac{dx_t}{dt} = x_1 - x_0\n$$\n\n训练时，最小化 $$\\mathbb{E}\\left[\\|v_\\theta(x_t, t) - (x_1 - x_0)\\|^2\\right]$$。\n\n```latex\n\\frac{dx_t}{dt} = v_\\theta(x_t, t)\n```\n'
    const { processSync } = useMarkdown()
    const failed = [...reply].map((_, index) => reply.slice(0, index + 1)).filter(prefix => processSync(withoutPendingMath(prefix)).includes('katex-error'))

    expect(failed).toEqual([])
  })
})
