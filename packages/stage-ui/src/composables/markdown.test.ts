import { describe, expect, it } from 'vitest'

import { useMarkdown } from './markdown'

describe('useMarkdown', () => {
  // https://github.com/moeru-ai/airi/discussions/2239
  it('renders each LaTeX fence line as display math (Issue #2239)', async () => {
    // ROOT CAUSE:
    //
    // LaTeX fences are parsed as source code, so Shiki highlights commands
    // instead of sending equations to KaTeX. Treating the whole fence as one
    // math block would also join separate equations on the same line.
    const markdown = [
      '```latex',
      String.raw`\frac{d}{dx}(c)=0`,
      String.raw`\frac{d}{dx}(x^n)=n x^{n-1}`,
      String.raw`\frac{d}{dx}(e^x)=e^x`,
      '```',
    ].join('\n')

    const { process, processSync } = useMarkdown()
    const initialHtml = processSync(markdown)
    const html = await process(markdown)

    expect(initialHtml.match(/<math/g) ?? []).toHaveLength(3)
    expect(html).not.toContain('class="shiki')
    expect(html.match(/<math/g) ?? []).toHaveLength(3)
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(c)=0')
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(x^n)=n x^{n-1}')
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(e^x)=e^x')
  })

  // https://github.com/moeru-ai/airi/pull/2326#discussion_r3812060520
  it('preserves a multiline LaTeX environment as one display formula', async () => {
    // ROOT CAUSE:
    //
    // Splitting every physical line separates the begin and end commands from
    // their environment, so KaTeX receives unmatched fragments.
    const markdown = [
      '```latex',
      String.raw`\begin{aligned}`,
      String.raw`f(x) &= x^2 \\`,
      String.raw`f'(x) &= 2x`,
      String.raw`\end{aligned}`,
      '```',
    ].join('\n')

    const html = await useMarkdown().process(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('<merror')
    expect(html).toContain('\\begin{aligned}')
    expect(html).toContain('\\end{aligned}')
  })

  // https://github.com/moeru-ai/airi/pull/2326#discussion_r3812060520
  it('preserves a fraction split across physical lines as one display formula', () => {
    const markdown = [
      '```latex',
      String.raw`\frac{`,
      '  a + b',
      '}{',
      '  c + d',
      '}',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('<merror')
    expect(html).toContain('\\frac{\n  a + b\n}{\n  c + d\n}')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3812440018
  it('preserves macro definitions with their dependent equations', () => {
    // ROOT CAUSE:
    //
    // Rendering each line separately discards macros after their definition,
    // so a later equation in the same fence sees an undefined command.
    const markdown = [
      '```latex',
      String.raw`\newcommand{\foo}{x=1}`,
      String.raw`\foo=2`,
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('<merror')
    expect(html).toContain('\\newcommand{\\foo}{x=1}\n\\foo=2')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3812513778
  it('preserves command arguments split across physical lines', () => {
    // ROOT CAUSE:
    //
    // Balanced groups do not prove that a physical line is a complete formula.
    // A command can consume a braced argument from the following line.
    const markdown = [
      '```latex',
      '\\frac{a=b}',
      '{c=d}',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('<merror')
    expect(html).toContain('\\frac{a=b}\n{c=d}')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818140362
  it('preserves paired delimiters split across physical lines', () => {
    // ROOT CAUSE:
    //
    // Balanced braces do not account for LaTeX delimiter commands, so a
    // cross-line left/right pair was incorrectly treated as two formulas.
    const markdown = [
      '```latex',
      '\\left(x=1',
      '\\right)=y',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('katex-error')
    expect(html).toContain('\\left(x=1\n\\right)=y')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818173297
  it('preserves bracketed command arguments split across physical lines', () => {
    // ROOT CAUSE:
    //
    // The continuation guard covered required braced arguments but not optional
    // bracketed arguments, so the command and its argument rendered separately.
    const markdown = [
      '```latex',
      'y = \\sqrt',
      '[3]{x = z}',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('katex-error')
    expect(html).toContain('y = \\sqrt\n[3]{x = z}')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818250572
  it('preserves subscript and superscript continuations across physical lines', () => {
    // ROOT CAUSE:
    //
    // A line beginning with a script marker continues the previous atom, but
    // the equation-list heuristic treated its relation as a standalone row.
    const markdown = [
      '```latex',
      'S = \\sum',
      '_{i=1}^{n} i = n(n+1)/2',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('katex-error')
    expect(html).toContain('S = \\sum\n_{i=1}^{n} i = n(n+1)/2')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219929
  it('preserves an equation continued after a trailing relation', () => {
    // ROOT CAUSE:
    //
    // A trailing relation matched the standalone-row heuristic even though its
    // right operand starts on the following physical line.
    const markdown = [
      '```latex',
      'x =',
      'y = z',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(1)
    expect(html).toContain('x =\ny = z')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219932
  it('renders literal inequalities as independent rows', () => {
    // ROOT CAUSE:
    //
    // The standalone relation matcher recognized LaTeX commands and equals
    // signs but omitted literal less-than and greater-than operators.
    const markdown = [
      '```latex',
      'x > 0',
      'y < 0',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(html.match(/<math/g) ?? []).toHaveLength(2)
  })

  // https://github.com/moeru-ai/airi/discussions/2239
  it('treats a tex fence as display math (Issue #2239)', async () => {
    const markdown = [
      '```tex',
      String.raw`\int c\,dx = cx + C`,
      '```',
    ].join('\n')

    const html = await useMarkdown().process(markdown)

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">\\int c\\,dx = cx + C')
  })

  // https://github.com/moeru-ai/airi/discussions/2239
  it('keeps two currency amounts as text (Issue #2239)', () => {
    // ROOT CAUSE:
    //
    // remark-math pairs the dollar sign before 5 with the dollar sign before
    // 10, which turns the words between two prices into an inline equation.
    const markdown = 'Price is $5 and cost is $10.'

    const html = useMarkdown().processSync(markdown)

    expect(html).toBe('<p>Price is $5 and cost is $10.</p>')
    expect(html).not.toContain('<math')
  })

  it('keeps numeric-leading inline math', () => {
    const html = useMarkdown().processSync('The result is $5 + x$.')

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">5 + x</annotation>')
  })

  it('keeps numeric-leading inline math with trailing whitespace before prose', () => {
    // ROOT CAUSE:
    //
    // A price-only check mistakes a numeric-leading equation for prose when
    // the equation ends in whitespace and the next text starts with a digit.
    const html = useMarkdown().processSync('The result is $5 + x $ 7 days later.')

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">5 + x </annotation>')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3812513785
  it('keeps inline math with a multi-letter unit before an amount', () => {
    // ROOT CAUSE:
    //
    // Treating any multi-letter token after a number as prose also matches
    // valid units such as ms and restores the math delimiters as text.
    const html = useMarkdown().processSync('At $5 ms $ 10 samples arrived.')

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">5 ms </annotation>')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219931
  it('keeps spaced variable products as inline math', () => {
    // ROOT CAUSE:
    //
    // Treating arbitrary multi-word letter sequences as prose also matches
    // valid products expressed as adjacent single-letter variables.
    const html = useMarkdown().processSync('Compare $5 x y $ 10 samples later.')

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">5 x y </annotation>')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818140379
  it('keeps two currency amounts joined by one conjunction as text', () => {
    // ROOT CAUSE:
    //
    // Requiring two prose words excludes a single conjunction between two
    // prices, so remark-math consumes both currency delimiters as formula.
    const html = useMarkdown().processSync('Prices are $5 and $10.')

    expect(html).toBe('<p>Prices are $5 and $10.</p>')
    expect(html).not.toContain('<math')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818173295
  it('keeps a compact currency range as text', () => {
    // ROOT CAUSE:
    //
    // Compact ranges have no whitespace before the second currency delimiter,
    // so the whitespace gate skipped recovery and rendered the range as math.
    const html = useMarkdown().processSync('Tickets cost $5-$10.')

    expect(html).toBe('<p>Tickets cost $5-$10.</p>')
    expect(html).not.toContain('<math')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219933
  it('keeps a currency range joined by to as text', () => {
    // ROOT CAUSE:
    //
    // The one-word currency bridge recognized conjunctions but omitted the
    // explicit range connector used between two amounts.
    const html = useMarkdown().processSync('Tickets cost $5 to $10.')

    expect(html).toBe('<p>Tickets cost $5 to $10.</p>')
    expect(html).not.toContain('<math')
  })

  it('keeps separate price formulas when both dollar signs close math', () => {
    const html = useMarkdown().processSync('Values are $5$ and $10$.')

    expect(html.match(/<math/g) ?? []).toHaveLength(2)
  })
})
